from __future__ import annotations

import hashlib
import json
import math
import re
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time
from decimal import Decimal, InvalidOperation
from typing import Any, Literal
from uuid import UUID, uuid5

from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_zones import V1_TIME_ZONE, V1_TIME_ZONE_NAME
from app.models import ActivityDay, Category, CompletionEvent, Task, UserSettings

ImportEntityName = Literal[
    "payload",
    "task",
    "category",
    "activity_date",
    "completion_event",
    "settings",
]

VALID_THEME_IDS = {
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
}
TIME_PATTERN = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")


@dataclass(frozen=True)
class ImportIssue:
    entity: ImportEntityName
    reason: str
    source_id: str | None = None


@dataclass(frozen=True)
class LegacyTask:
    source_id: str
    category_name: str
    title: str
    scheduled_date: date
    start_time: time
    planned_minutes: int
    reminder_enabled: bool
    reminder_minutes_before: int
    actual_completed_minutes: Decimal
    completion_state: str
    important: bool
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class LegacyCompletionEvent:
    source_id: str
    source_task_id: str | None
    completed_at: datetime


@dataclass(frozen=True)
class LegacySettings:
    manual_theme_id: str | None
    sidebar_collapsed: bool


@dataclass
class LegacyImportPlan:
    source_version: int | None = None
    tasks: list[LegacyTask] = field(default_factory=list)
    category_names: list[str] = field(default_factory=list)
    activity_dates: list[date] = field(default_factory=list)
    completion_events: list[LegacyCompletionEvent] = field(default_factory=list)
    settings: LegacySettings | None = None
    issues: list[ImportIssue] = field(default_factory=list)


@dataclass(frozen=True)
class EntityImportSummary:
    valid: int
    invalid: int
    created: int = 0
    existing: int = 0


@dataclass(frozen=True)
class LegacyImportResult:
    source_version: int | None
    digest: str
    tasks: EntityImportSummary
    categories: EntityImportSummary
    activity_dates: EntityImportSummary
    completion_events: EntityImportSummary
    settings_status: str
    issues: list[ImportIssue]
    warnings: list[str]


def create_import_digest(serialized_state: str, include_settings: bool) -> str:
    digest_input = json.dumps(
        {"include_settings": include_settings, "serialized_state": serialized_state},
        separators=(",", ":"),
        sort_keys=True,
    )
    return hashlib.sha256(digest_input.encode("utf-8")).hexdigest()


def parse_legacy_planner_state(serialized_state: str) -> LegacyImportPlan:
    plan = LegacyImportPlan()
    try:
        raw_state = json.loads(serialized_state)
    except (json.JSONDecodeError, TypeError):
        plan.issues.append(ImportIssue("payload", "The browser data is not valid JSON."))
        return plan

    if not isinstance(raw_state, dict) or raw_state.get("version") not in (1, 2):
        plan.issues.append(
            ImportIssue("payload", "Only Let's Do browser data versions 1 and 2 are supported.")
        )
        return plan

    plan.source_version = raw_state["version"]
    completion_events = _parse_completion_events(raw_state, plan)
    completion_by_task = {
        event.source_task_id: event.completed_at
        for event in completion_events
        if event.source_task_id is not None
    }
    plan.tasks = _parse_tasks(raw_state.get("tasks"), completion_by_task, plan)
    valid_task_ids = {task.source_id for task in plan.tasks}

    # A completion timestamp remains useful for streak history even when its task
    # record is invalid or no longer present, so such events are imported unlinked.
    seen_linked_task_ids: set[str] = set()
    for event in completion_events:
        source_task_id = event.source_task_id
        if source_task_id is not None and source_task_id not in valid_task_ids:
            event = LegacyCompletionEvent(event.source_id, None, event.completed_at)
        if event.source_task_id is not None:
            if event.source_task_id in seen_linked_task_ids:
                plan.issues.append(
                    ImportIssue(
                        "completion_event",
                        "Only one completion event can be linked to a task.",
                        event.source_id,
                    )
                )
                continue
            seen_linked_task_ids.add(event.source_task_id)
        plan.completion_events.append(event)

    plan.activity_dates = _parse_activity_dates(raw_state.get("activityDates"), plan)
    plan.category_names = _parse_categories(raw_state, plan)
    plan.category_names.extend(task.category_name for task in plan.tasks)
    plan.category_names = _unique_names(plan.category_names)
    plan.settings = _parse_settings(raw_state.get("settings"), plan)
    return plan


def _parse_tasks(
    raw_tasks: Any,
    completion_by_task: dict[str, datetime],
    plan: LegacyImportPlan,
) -> list[LegacyTask]:
    if not isinstance(raw_tasks, list):
        plan.issues.append(ImportIssue("payload", "The tasks field must be a list."))
        return []

    tasks: list[LegacyTask] = []
    seen_ids: set[str] = set()
    for index, raw_task in enumerate(raw_tasks):
        source_reference = f"tasks[{index}]"
        if not isinstance(raw_task, dict):
            plan.issues.append(ImportIssue("task", "The task must be an object.", source_reference))
            continue
        source_id = _non_blank_string(raw_task.get("id"), 500)
        issue_reference = source_id or source_reference
        try:
            if source_id is None:
                raise ValueError("Task ID is missing or invalid.")
            if source_id in seen_ids:
                raise ValueError("Task ID is duplicated in the browser data.")
            title = _required_string(raw_task.get("title"), "Task name", 200)
            category_name = _required_string(raw_task.get("category"), "Category", 100)
            scheduled_date = _required_date(raw_task.get("date"), "Scheduled date")
            start_time = _required_time(raw_task.get("startTime"))
            planned_minutes = _required_positive_integer(
                raw_task.get("plannedMinutes"), "Estimated duration"
            )
            actual_minutes = _required_decimal(raw_task.get("actualCompletedMinutes"))
            if actual_minutes > planned_minutes:
                raise ValueError("Completed minutes exceed the estimated duration.")
            reminder = raw_task.get("reminder")
            if not isinstance(reminder, dict) or not isinstance(reminder.get("enabled"), bool):
                raise ValueError("Reminder settings are invalid.")
            reminder_minutes = _required_non_negative_integer(
                reminder.get("minutesBefore"), "Reminder minutes"
            )
            if reminder_minutes > 32767:
                raise ValueError("Reminder minutes exceed the supported range.")
            if not isinstance(raw_task.get("important"), bool):
                raise ValueError("Important must be true or false.")
            created_at = _required_timestamp(raw_task.get("createdAt"), "Created timestamp")
            updated_at = _required_timestamp(raw_task.get("updatedAt"), "Updated timestamp")
            completed_at = _optional_timestamp(raw_task.get("completedAt"), "Completion timestamp")
            completion_state = _completion_state(raw_task, actual_minutes, planned_minutes)
            if completion_state == "completed" and completed_at is None:
                completed_at = completion_by_task.get(source_id)
            if completion_state == "completed" and completed_at is None:
                raise ValueError("A completed task requires a completion timestamp.")
            if completion_state != "completed" and completed_at is not None:
                raise ValueError("Only a completed task may have a completion timestamp.")
        except ValueError as error:
            plan.issues.append(ImportIssue("task", str(error), issue_reference))
            continue

        seen_ids.add(source_id)
        tasks.append(
            LegacyTask(
                source_id=source_id,
                category_name=category_name,
                title=title,
                scheduled_date=scheduled_date,
                start_time=start_time,
                planned_minutes=planned_minutes,
                reminder_enabled=reminder["enabled"],
                reminder_minutes_before=reminder_minutes,
                actual_completed_minutes=actual_minutes,
                completion_state=completion_state,
                important=raw_task["important"],
                completed_at=completed_at,
                created_at=created_at,
                updated_at=updated_at,
            )
        )
    return tasks


def _parse_completion_events(
    raw_state: dict[str, Any],
    plan: LegacyImportPlan,
) -> list[LegacyCompletionEvent]:
    events: list[LegacyCompletionEvent] = []
    if plan.source_version == 1:
        raw_events = raw_state.get("completionTimestamps", [])
        if not isinstance(raw_events, list):
            plan.issues.append(
                ImportIssue("payload", "The completionTimestamps field must be a list.")
            )
            return events
        for index, timestamp in enumerate(raw_events):
            source_id = f"v1-completion-{index}"
            try:
                completed_at = _required_timestamp(timestamp, "Completion timestamp")
            except ValueError as error:
                plan.issues.append(ImportIssue("completion_event", str(error), source_id))
                continue
            matching_task_id = _v1_matching_task_id(raw_state.get("tasks"), timestamp)
            events.append(LegacyCompletionEvent(source_id, matching_task_id, completed_at))
        return events

    raw_events = raw_state.get("completionEvents", [])
    if not isinstance(raw_events, list):
        plan.issues.append(ImportIssue("payload", "The completionEvents field must be a list."))
        return events
    seen_ids: set[str] = set()
    for index, raw_event in enumerate(raw_events):
        reference = f"completionEvents[{index}]"
        if not isinstance(raw_event, dict):
            plan.issues.append(
                ImportIssue(
                    "completion_event", "The completion event must be an object.", reference
                )
            )
            continue
        source_id = _non_blank_string(raw_event.get("id"), 500)
        try:
            if source_id is None:
                raise ValueError("Completion event ID is missing or invalid.")
            if source_id in seen_ids:
                raise ValueError("Completion event ID is duplicated in the browser data.")
            raw_task_id = raw_event.get("taskId")
            source_task_id = None if raw_task_id is None else _non_blank_string(raw_task_id, 500)
            if raw_task_id is not None and source_task_id is None:
                raise ValueError("Completion event task ID is invalid.")
            completed_at = _required_timestamp(raw_event.get("completedAt"), "Completion timestamp")
        except ValueError as error:
            plan.issues.append(ImportIssue("completion_event", str(error), source_id or reference))
            continue
        seen_ids.add(source_id)
        events.append(LegacyCompletionEvent(source_id, source_task_id, completed_at))
    return events


def _parse_activity_dates(raw_dates: Any, plan: LegacyImportPlan) -> list[date]:
    if raw_dates is None:
        return []
    if not isinstance(raw_dates, list):
        plan.issues.append(ImportIssue("payload", "The activityDates field must be a list."))
        return []
    parsed_dates: list[date] = []
    for index, raw_date in enumerate(raw_dates):
        try:
            parsed_dates.append(_required_date(raw_date, "Activity date"))
        except ValueError as error:
            plan.issues.append(ImportIssue("activity_date", str(error), f"activityDates[{index}]"))
    return sorted(set(parsed_dates))


def _parse_categories(raw_state: dict[str, Any], plan: LegacyImportPlan) -> list[str]:
    raw_categories = raw_state.get("customCategories", []) if plan.source_version == 2 else []
    if not isinstance(raw_categories, list):
        plan.issues.append(ImportIssue("payload", "The customCategories field must be a list."))
        return []
    categories: list[str] = []
    for index, raw_name in enumerate(raw_categories):
        try:
            categories.append(_required_string(raw_name, "Category", 100))
        except ValueError as error:
            plan.issues.append(ImportIssue("category", str(error), f"customCategories[{index}]"))
    return categories


def _parse_settings(raw_settings: Any, plan: LegacyImportPlan) -> LegacySettings | None:
    if raw_settings is None:
        return None
    if not isinstance(raw_settings, dict):
        plan.issues.append(ImportIssue("settings", "Settings must be an object."))
        return None
    manual_theme_id = raw_settings.get("manualThemeId")
    if manual_theme_id is not None and manual_theme_id not in VALID_THEME_IDS:
        plan.issues.append(ImportIssue("settings", "The selected weekday theme is invalid."))
        return None
    sidebar_collapsed = raw_settings.get("sidebarCollapsed", False)
    if not isinstance(sidebar_collapsed, bool):
        plan.issues.append(ImportIssue("settings", "The sidebar setting must be true or false."))
        return None
    return LegacySettings(manual_theme_id, sidebar_collapsed)


def _completion_state(raw_task: dict[str, Any], actual: Decimal, planned: int) -> str:
    if raw_task.get("completionState") == "incomplete" and actual == 0:
        return "incomplete"
    if actual == 0:
        return "pending"
    if actual < planned:
        return "partial"
    return "completed"


def _v1_matching_task_id(raw_tasks: Any, timestamp: Any) -> str | None:
    if not isinstance(raw_tasks, list):
        return None
    for task_value in raw_tasks:
        if isinstance(task_value, dict) and task_value.get("completedAt") == timestamp:
            return _non_blank_string(task_value.get("id"), 500)
    return None


def _required_string(value: Any, label: str, maximum_length: int) -> str:
    normalized = _non_blank_string(value, maximum_length)
    if normalized is None:
        raise ValueError(f"{label} is missing, blank, or too long.")
    return normalized


def _non_blank_string(value: Any, maximum_length: int) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized if normalized and len(normalized) <= maximum_length else None


def _required_positive_integer(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0 or value > 2_147_483_647:
        raise ValueError(f"{label} must be a positive whole number.")
    return value


def _required_non_negative_integer(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"{label} must be a non-negative whole number.")
    return value


def _required_decimal(value: Any) -> Decimal:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError("Completed minutes must be a finite number.")
    try:
        result = Decimal(str(value))
    except InvalidOperation as error:
        raise ValueError("Completed minutes are invalid.") from error
    if result < 0 or result.as_tuple().exponent < -2 or result >= Decimal("10000000000"):
        raise ValueError("Completed minutes are outside the supported range or precision.")
    return result


def _required_date(value: Any, label: str) -> date:
    if not isinstance(value, str):
        raise ValueError(f"{label} is invalid.")
    try:
        parsed = date.fromisoformat(value)
    except ValueError as error:
        raise ValueError(f"{label} is invalid.") from error
    if parsed.isoformat() != value:
        raise ValueError(f"{label} is invalid.")
    return parsed


def _required_time(value: Any) -> time:
    if not isinstance(value, str) or not TIME_PATTERN.fullmatch(value):
        raise ValueError("Start time must use 24-hour HH:mm format.")
    return time.fromisoformat(value)


def _required_timestamp(value: Any, label: str) -> datetime:
    parsed = _optional_timestamp(value, label)
    if parsed is None:
        raise ValueError(f"{label} is missing or invalid.")
    return parsed


def _optional_timestamp(value: Any, label: str) -> datetime | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"{label} is invalid.")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError(f"{label} is invalid.") from error
    if parsed.tzinfo is None:
        raise ValueError(f"{label} must include a time zone.")
    return parsed.astimezone(UTC)


def _unique_names(names: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for name in names:
        normalized = name.strip().lower()
        if normalized not in seen:
            seen.add(normalized)
            result.append(name.strip())
    return result


def _deterministic_id(user_id: UUID, entity: str, source_id: str) -> UUID:
    return uuid5(user_id, f"lets-do-local-storage:{entity}:{source_id}")


async def preview_legacy_import(
    database_session: AsyncSession,
    user_id: UUID,
    serialized_state: str,
    include_settings: bool,
) -> LegacyImportResult:
    plan = parse_legacy_planner_state(serialized_state)
    return await _summarize_import(
        database_session, user_id, plan, serialized_state, include_settings, commit=False
    )


async def commit_legacy_import(
    database_session: AsyncSession,
    user_id: UUID,
    serialized_state: str,
    include_settings: bool,
) -> LegacyImportResult:
    plan = parse_legacy_planner_state(serialized_state)
    return await _summarize_import(
        database_session, user_id, plan, serialized_state, include_settings, commit=True
    )


async def _summarize_import(
    database_session: AsyncSession,
    user_id: UUID,
    plan: LegacyImportPlan,
    serialized_state: str,
    include_settings: bool,
    *,
    commit: bool,
) -> LegacyImportResult:
    digest = create_import_digest(serialized_state, include_settings)
    category_by_name = await _existing_categories(database_session, user_id)
    category_existing = sum(name.lower() in category_by_name for name in plan.category_names)
    new_categories = [name for name in plan.category_names if name.lower() not in category_by_name]

    if commit and new_categories:
        rows = [
            {
                "id": _deterministic_id(user_id, "category", name.lower()),
                "user_id": user_id,
                "name": name,
            }
            for name in new_categories
        ]
        await database_session.execute(insert(Category).values(rows).on_conflict_do_nothing())
        category_by_name = await _existing_categories(database_session, user_id)

    task_ids = {_deterministic_id(user_id, "task", task.source_id) for task in plan.tasks}
    existing_task_ids = await _existing_ids(
        database_session, Task.id, Task.user_id, user_id, task_ids
    )
    task_rows = []
    for task in plan.tasks:
        task_id = _deterministic_id(user_id, "task", task.source_id)
        category_id = category_by_name.get(task.category_name.lower())
        if category_id is None:
            continue
        task_rows.append(
            {
                "id": task_id,
                "user_id": user_id,
                "category_id": category_id,
                "title": task.title,
                "scheduled_date": task.scheduled_date,
                "start_time": task.start_time,
                "schedule_time_zone": V1_TIME_ZONE_NAME,
                "planned_minutes": task.planned_minutes,
                "reminder_enabled": task.reminder_enabled,
                "reminder_minutes_before": task.reminder_minutes_before,
                "actual_completed_minutes": task.actual_completed_minutes,
                "completion_state": task.completion_state,
                "important": task.important,
                "completed_at": task.completed_at,
                "version": 1,
                "created_at": task.created_at,
                "updated_at": task.updated_at,
            }
        )
    if commit and task_rows:
        await database_session.execute(insert(Task).values(task_rows).on_conflict_do_nothing())

    existing_activity_dates = await _existing_activity_dates(
        database_session, user_id, set(plan.activity_dates)
    )
    if commit and plan.activity_dates:
        await database_session.execute(
            insert(ActivityDay)
            .values(
                [
                    {
                        "user_id": user_id,
                        "activity_date": activity_date,
                        "recorded_at": datetime.combine(
                            activity_date,
                            time.min,
                            tzinfo=V1_TIME_ZONE,
                        ).astimezone(UTC),
                    }
                    for activity_date in plan.activity_dates
                ]
            )
            .on_conflict_do_nothing()
        )

    event_candidates = [
        (
            _deterministic_id(user_id, "completion-event", event.source_id),
            (
                _deterministic_id(user_id, "task", event.source_task_id)
                if event.source_task_id is not None
                else None
            ),
            event,
        )
        for event in plan.completion_events
    ]
    existing_event_ids, existing_linked_task_ids = await _existing_completion_events(
        database_session,
        user_id,
        {event_id for event_id, _, _ in event_candidates},
        {task_id for _, task_id, _ in event_candidates if task_id is not None},
    )
    existing_event_count = sum(
        event_id in existing_event_ids
        or (linked_task_id is not None and linked_task_id in existing_linked_task_ids)
        for event_id, linked_task_id, _ in event_candidates
    )
    event_rows = [
        {
            "id": event_id,
            "user_id": user_id,
            "task_id": linked_task_id,
            "completed_at": event.completed_at,
        }
        for event_id, linked_task_id, event in event_candidates
    ]
    if commit and event_rows:
        await database_session.execute(
            insert(CompletionEvent).values(event_rows).on_conflict_do_nothing()
        )

    settings_exists = await database_session.scalar(
        select(UserSettings.user_id).where(UserSettings.user_id == user_id)
    )
    settings_status = "not_requested"
    if include_settings:
        if plan.settings is None:
            settings_status = "invalid_or_missing"
        elif settings_exists is not None:
            settings_status = "preserved_existing"
        elif commit:
            await database_session.execute(
                insert(UserSettings)
                .values(
                    user_id=user_id,
                    manual_theme_id=plan.settings.manual_theme_id,
                    sidebar_collapsed=plan.settings.sidebar_collapsed,
                    time_zone=V1_TIME_ZONE_NAME,
                )
                .on_conflict_do_nothing()
            )
            settings_status = "created"
        else:
            settings_status = "ready"

    warnings = await _semantic_duplicate_warnings(database_session, user_id, plan.tasks, task_ids)
    invalid_counts = {
        entity: sum(issue.entity == entity for issue in plan.issues)
        for entity in ("task", "category", "activity_date", "completion_event")
    }
    return LegacyImportResult(
        source_version=plan.source_version,
        digest=digest,
        tasks=EntityImportSummary(
            len(plan.tasks),
            invalid_counts["task"],
            len(task_ids - existing_task_ids) if commit else 0,
            len(existing_task_ids),
        ),
        categories=EntityImportSummary(
            len(plan.category_names),
            invalid_counts["category"],
            len(new_categories) if commit else 0,
            category_existing,
        ),
        activity_dates=EntityImportSummary(
            len(plan.activity_dates),
            invalid_counts["activity_date"],
            len(set(plan.activity_dates) - existing_activity_dates) if commit else 0,
            len(existing_activity_dates),
        ),
        completion_events=EntityImportSummary(
            len(plan.completion_events),
            invalid_counts["completion_event"],
            len(plan.completion_events) - existing_event_count if commit else 0,
            existing_event_count,
        ),
        settings_status=settings_status,
        issues=plan.issues,
        warnings=warnings,
    )


async def _existing_categories(database_session: AsyncSession, user_id: UUID) -> dict[str, UUID]:
    rows = (
        await database_session.execute(
            select(Category.id, Category.name).where(Category.user_id == user_id)
        )
    ).all()
    return {name.strip().lower(): category_id for category_id, name in rows}


async def _existing_ids(
    database_session: AsyncSession,
    id_column: Any,
    user_column: Any,
    user_id: UUID,
    candidate_ids: set[UUID],
) -> set[UUID]:
    if not candidate_ids:
        return set()
    query = select(id_column).where(user_column == user_id, id_column.in_(candidate_ids))
    return set((await database_session.execute(query)).scalars().all())


async def _existing_activity_dates(
    database_session: AsyncSession,
    user_id: UUID,
    candidate_dates: set[date],
) -> set[date]:
    if not candidate_dates:
        return set()
    query = select(ActivityDay.activity_date).where(
        ActivityDay.user_id == user_id,
        ActivityDay.activity_date.in_(candidate_dates),
    )
    return set((await database_session.execute(query)).scalars().all())


async def _existing_completion_events(
    database_session: AsyncSession,
    user_id: UUID,
    candidate_event_ids: set[UUID],
    candidate_task_ids: set[UUID],
) -> tuple[set[UUID], set[UUID]]:
    if not candidate_event_ids and not candidate_task_ids:
        return set(), set()
    query = select(CompletionEvent.id, CompletionEvent.task_id).where(
        CompletionEvent.user_id == user_id,
        or_(
            CompletionEvent.id.in_(candidate_event_ids),
            CompletionEvent.task_id.in_(candidate_task_ids),
        ),
    )
    rows = (await database_session.execute(query)).all()
    return (
        {event_id for event_id, _ in rows},
        {task_id for _, task_id in rows if task_id is not None},
    )


async def _semantic_duplicate_warnings(
    database_session: AsyncSession,
    user_id: UUID,
    tasks: list[LegacyTask],
    deterministic_ids: set[UUID],
) -> list[str]:
    if not tasks:
        return []
    existing = (
        await database_session.execute(
            select(Task.id, Task.title, Task.scheduled_date, Task.start_time).where(
                Task.user_id == user_id,
                Task.scheduled_date.in_({task.scheduled_date for task in tasks}),
                Task.id.not_in(deterministic_ids),
            )
        )
    ).all()
    existing_keys = {
        (title.strip().lower(), scheduled_date, start_time)
        for _, title, scheduled_date, start_time in existing
    }
    duplicate_count = sum(
        (task.title.strip().lower(), task.scheduled_date, task.start_time) in existing_keys
        for task in tasks
    )
    if duplicate_count == 0:
        return []
    return [
        f"{duplicate_count} imported task(s) have the same name, date, and start time as existing "
        "server tasks. They will remain separate records."
    ]
