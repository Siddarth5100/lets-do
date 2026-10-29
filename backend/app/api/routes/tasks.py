from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Annotated, Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator, model_validator
from sqlalchemy import and_, delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.exc import StaleDataError

from app.api.dependencies import get_authenticated_database_session, get_authenticated_user
from app.core.errors import (
    CategoryNotFoundError,
    TaskNotFoundError,
    TaskRescheduleUnavailableError,
    TaskSchedulingWarningError,
    TaskTransitionError,
    TaskVersionConflictError,
)
from app.core.security import AuthenticatedUser
from app.core.time_zones import V1_TIME_ZONE, get_v1_date, validate_v1_time_zone
from app.models import ActivityDay, Category, CompletionEvent, Task

router = APIRouter(prefix="/api/v1/tasks", tags=["tasks"])

TIME_PATTERN = re.compile(r"^\d{2}:\d{2}$")
REMINDER_MINUTE_OPTIONS = {0, 5, 10, 15, 30, 45, 60}
SCHEDULE_FIELDS = {
    "scheduled_date",
    "start_time",
    "schedule_time_zone",
    "planned_minutes",
}
EDITABLE_FIELDS = {
    "category_id",
    "title",
    *SCHEDULE_FIELDS,
    "reminder_enabled",
    "reminder_minutes_before",
    "important",
}


def get_current_time() -> datetime:
    return datetime.now(UTC)


def normalize_title(title: str) -> str:
    return title.strip()


def validate_time_zone(time_zone: str) -> str:
    return validate_v1_time_zone(time_zone, "schedule_time_zone")


def validate_start_time(start_time: str) -> str:
    if not TIME_PATTERN.fullmatch(start_time):
        raise ValueError("start_time must use 24-hour HH:MM format")
    hours, minutes = (int(part) for part in start_time.split(":"))
    if hours > 23 or minutes > 59:
        raise ValueError("start_time must use 24-hour HH:MM format")
    return start_time


class TaskCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category_id: UUID
    title: str = Field(min_length=1, max_length=200)
    scheduled_date: date
    start_time: str
    schedule_time_zone: str = Field(min_length=1, max_length=64)
    planned_minutes: int = Field(gt=0)
    reminder_enabled: StrictBool = False
    reminder_minutes_before: int = 10
    important: StrictBool = False
    confirm_warnings: StrictBool = False

    @field_validator("title", mode="before")
    @classmethod
    def trim_title(cls, title: object) -> object:
        return normalize_title(title) if isinstance(title, str) else title

    @field_validator("start_time")
    @classmethod
    def check_start_time(cls, start_time: str) -> str:
        return validate_start_time(start_time)

    @field_validator("schedule_time_zone")
    @classmethod
    def check_time_zone(cls, time_zone: str) -> str:
        return validate_time_zone(time_zone)

    @field_validator("reminder_minutes_before")
    @classmethod
    def check_reminder_minutes(cls, minutes: int) -> int:
        if minutes not in REMINDER_MINUTE_OPTIONS:
            raise ValueError("reminder_minutes_before must be a supported reminder option")
        return minutes


class TaskUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int = Field(ge=1)
    category_id: UUID | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)
    scheduled_date: date | None = None
    start_time: str | None = None
    schedule_time_zone: str | None = Field(default=None, min_length=1, max_length=64)
    planned_minutes: int | None = Field(default=None, gt=0)
    reminder_enabled: StrictBool | None = None
    reminder_minutes_before: int | None = None
    important: StrictBool | None = None
    confirm_warnings: StrictBool = False

    @field_validator("title", mode="before")
    @classmethod
    def trim_title(cls, title: object) -> object:
        return normalize_title(title) if isinstance(title, str) else title

    @field_validator("start_time")
    @classmethod
    def check_start_time(cls, start_time: str | None) -> str | None:
        return validate_start_time(start_time) if start_time is not None else None

    @field_validator("schedule_time_zone")
    @classmethod
    def check_time_zone(cls, time_zone: str | None) -> str | None:
        return validate_time_zone(time_zone) if time_zone is not None else None

    @field_validator("reminder_minutes_before")
    @classmethod
    def check_reminder_minutes(cls, minutes: int | None) -> int | None:
        if minutes is not None and minutes not in REMINDER_MINUTE_OPTIONS:
            raise ValueError("reminder_minutes_before must be a supported reminder option")
        return minutes

    @model_validator(mode="after")
    def require_an_update(self) -> TaskUpdateRequest:
        supplied_fields = self.model_fields_set & EDITABLE_FIELDS
        if not supplied_fields:
            raise ValueError("At least one task field must be provided")
        if any(getattr(self, field_name) is None for field_name in supplied_fields):
            raise ValueError("Task fields cannot be null")
        return self


class TaskCompletionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int = Field(ge=1)
    action: Literal["complete", "toggle_partial", "mark_incomplete", "reopen"]
    confirm_warnings: StrictBool = False


class TaskResponse(BaseModel):
    id: UUID
    category_id: UUID
    category_name: str
    title: str
    scheduled_date: date
    start_time: str
    schedule_time_zone: str
    planned_minutes: int
    reminder_enabled: bool
    reminder_minutes_before: int
    actual_completed_minutes: float
    completion_state: Literal["pending", "partial", "completed", "incomplete"]
    important: bool
    completed_at: datetime | None
    max_points: float
    earned_points: float
    version: int
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True, slots=True)
class TaskCandidate:
    id: UUID | None
    title: str
    scheduled_date: date
    start_time: time
    planned_minutes: int


def create_task_response(task: Task, category: Category) -> TaskResponse:
    planned_minutes = task.planned_minutes
    completed_minutes = float(task.actual_completed_minutes)
    maximum_points = max(1.0, planned_minutes / 60)
    earned_points = maximum_points * (completed_minutes / planned_minutes)
    return TaskResponse(
        id=task.id,
        category_id=task.category_id,
        category_name=category.name,
        title=task.title,
        scheduled_date=task.scheduled_date,
        start_time=task.start_time.strftime("%H:%M"),
        schedule_time_zone=task.schedule_time_zone,
        planned_minutes=planned_minutes,
        reminder_enabled=task.reminder_enabled,
        reminder_minutes_before=task.reminder_minutes_before,
        actual_completed_minutes=completed_minutes,
        completion_state=task.completion_state,
        important=task.important,
        completed_at=task.completed_at,
        max_points=maximum_points,
        earned_points=earned_points,
        version=task.version,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


def parse_start_time(start_time: str) -> time:
    hours, minutes = (int(part) for part in start_time.split(":"))
    return time(hour=hours, minute=minutes)


def normalize_duplicate_title(title: str) -> str:
    return " ".join(title.strip().split()).lower()


def task_interval(candidate: TaskCandidate) -> tuple[int, int]:
    day_start = candidate.scheduled_date.toordinal() * 24 * 60
    start = day_start + candidate.start_time.hour * 60 + candidate.start_time.minute
    return start, start + candidate.planned_minutes


def find_scheduling_warnings(
    candidate: TaskCandidate,
    existing_tasks: list[Task],
) -> dict[str, Any]:
    candidate_start, candidate_end = task_interval(candidate)
    normalized_title = normalize_duplicate_title(candidate.title)
    duplicate_tasks: list[dict[str, str]] = []
    overlapping_tasks: list[dict[str, str]] = []

    for task in existing_tasks:
        if task.id == candidate.id:
            continue
        if (
            task.scheduled_date == candidate.scheduled_date
            and normalize_duplicate_title(task.title) == normalized_title
        ):
            duplicate_tasks.append({"id": str(task.id), "title": task.title})

        existing_candidate = TaskCandidate(
            id=task.id,
            title=task.title,
            scheduled_date=task.scheduled_date,
            start_time=task.start_time,
            planned_minutes=task.planned_minutes,
        )
        existing_start, existing_end = task_interval(existing_candidate)
        if candidate_start < existing_end and existing_start < candidate_end:
            overlapping_tasks.append({"id": str(task.id), "title": task.title})

    warnings: dict[str, Any] = {}
    if duplicate_tasks:
        warnings["duplicate_tasks"] = duplicate_tasks
    if overlapping_tasks:
        warnings["overlapping_tasks"] = overlapping_tasks
    return warnings


def is_reschedule_allowed(task: Task, current_time: datetime) -> bool:
    scheduled_start = datetime.combine(
        task.scheduled_date,
        task.start_time,
        tzinfo=V1_TIME_ZONE,
    )
    return current_time.astimezone(V1_TIME_ZONE) < scheduled_start - timedelta(hours=1)


def local_activity_date(task: Task, current_time: datetime) -> date:
    # V1 preserves every stored wall-clock date/time and interprets legacy zone
    # metadata as an India schedule without rewriting existing rows.
    return get_v1_date(current_time)


def ensure_task_version(task: Task, supplied_version: int) -> None:
    if task.version != supplied_version:
        raise TaskVersionConflictError


async def get_owned_category(
    database_session: AsyncSession,
    user_id: UUID,
    category_id: UUID,
) -> Category:
    query = select(Category).where(
        Category.id == category_id,
        Category.user_id == user_id,
    )
    category = (await database_session.execute(query)).scalar_one_or_none()
    if category is None:
        raise CategoryNotFoundError
    return category


async def get_owned_task(
    database_session: AsyncSession,
    user_id: UUID,
    task_id: UUID,
) -> tuple[Task, Category]:
    query = (
        select(Task, Category)
        .join(
            Category,
            and_(Category.id == Task.category_id, Category.user_id == Task.user_id),
        )
        .where(Task.id == task_id, Task.user_id == user_id)
    )
    row = (await database_session.execute(query)).one_or_none()
    if row is None:
        raise TaskNotFoundError
    return row[0], row[1]


async def get_owned_tasks(database_session: AsyncSession, user_id: UUID) -> list[Task]:
    query = (
        select(Task)
        .where(Task.user_id == user_id)
        .order_by(Task.scheduled_date, Task.start_time, Task.title, Task.id)
    )
    return list((await database_session.execute(query)).scalars().all())


async def record_activity(
    database_session: AsyncSession,
    user_id: UUID,
    activity_date: date,
    current_time: datetime,
) -> None:
    statement = (
        insert(ActivityDay)
        .values(user_id=user_id, activity_date=activity_date, recorded_at=current_time)
        .on_conflict_do_nothing(
            index_elements=[ActivityDay.user_id, ActivityDay.activity_date],
        )
    )
    await database_session.execute(statement)


async def remove_completion_event(
    database_session: AsyncSession,
    user_id: UUID,
    task_id: UUID,
) -> None:
    await database_session.execute(
        delete(CompletionEvent).where(
            CompletionEvent.user_id == user_id,
            CompletionEvent.task_id == task_id,
        )
    )


@router.get("", response_model=list[TaskResponse])
async def get_tasks(
    authenticated_user: Annotated[AuthenticatedUser, Depends(get_authenticated_user)],
    database_session: Annotated[
        AsyncSession,
        Depends(get_authenticated_database_session),
    ],
) -> list[TaskResponse]:
    query = (
        select(Task, Category)
        .join(
            Category,
            and_(Category.id == Task.category_id, Category.user_id == Task.user_id),
        )
        .where(Task.user_id == authenticated_user.user_id)
        .order_by(Task.scheduled_date, Task.start_time, Task.id)
    )
    rows = (await database_session.execute(query)).all()
    return [create_task_response(row[0], row[1]) for row in rows]


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: UUID,
    authenticated_user: Annotated[AuthenticatedUser, Depends(get_authenticated_user)],
    database_session: Annotated[
        AsyncSession,
        Depends(get_authenticated_database_session),
    ],
) -> TaskResponse:
    task, category = await get_owned_task(
        database_session,
        authenticated_user.user_id,
        task_id,
    )
    return create_task_response(task, category)


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    task_request: TaskCreateRequest,
    authenticated_user: Annotated[AuthenticatedUser, Depends(get_authenticated_user)],
    database_session: Annotated[
        AsyncSession,
        Depends(get_authenticated_database_session),
    ],
) -> TaskResponse:
    user_id = authenticated_user.user_id
    category = await get_owned_category(database_session, user_id, task_request.category_id)
    start_time = parse_start_time(task_request.start_time)
    candidate = TaskCandidate(
        id=None,
        title=task_request.title,
        scheduled_date=task_request.scheduled_date,
        start_time=start_time,
        planned_minutes=task_request.planned_minutes,
    )
    if not task_request.confirm_warnings:
        warnings = find_scheduling_warnings(
            candidate,
            await get_owned_tasks(database_session, user_id),
        )
        if warnings:
            raise TaskSchedulingWarningError(warnings)

    current_time = get_current_time()
    task = Task(
        id=uuid4(),
        user_id=user_id,
        category_id=category.id,
        title=task_request.title,
        scheduled_date=task_request.scheduled_date,
        start_time=start_time,
        schedule_time_zone=task_request.schedule_time_zone,
        planned_minutes=task_request.planned_minutes,
        reminder_enabled=task_request.reminder_enabled,
        reminder_minutes_before=task_request.reminder_minutes_before,
        actual_completed_minutes=Decimal("0"),
        completion_state="pending",
        important=task_request.important,
        completed_at=None,
        version=1,
        created_at=current_time,
        updated_at=current_time,
    )
    database_session.add(task)
    await database_session.flush()
    await record_activity(
        database_session,
        user_id,
        local_activity_date(task, current_time),
        current_time,
    )
    return create_task_response(task, category)


@router.patch("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: UUID,
    task_request: TaskUpdateRequest,
    authenticated_user: Annotated[AuthenticatedUser, Depends(get_authenticated_user)],
    database_session: Annotated[
        AsyncSession,
        Depends(get_authenticated_database_session),
    ],
) -> TaskResponse:
    user_id = authenticated_user.user_id
    task, category = await get_owned_task(database_session, user_id, task_id)
    ensure_task_version(task, task_request.version)
    supplied_fields = task_request.model_fields_set & EDITABLE_FIELDS
    schedule_changed = any(
        field_name in supplied_fields
        and (
            parse_start_time(task_request.start_time)
            if field_name == "start_time"
            else getattr(task_request, field_name)
        )
        != getattr(task, field_name)
        for field_name in SCHEDULE_FIELDS
    )
    current_time = get_current_time()
    if schedule_changed and not is_reschedule_allowed(task, current_time):
        raise TaskRescheduleUnavailableError

    if "category_id" in supplied_fields and task_request.category_id != task.category_id:
        category = await get_owned_category(database_session, user_id, task_request.category_id)

    candidate = TaskCandidate(
        id=task.id,
        title=task_request.title if "title" in supplied_fields else task.title,
        scheduled_date=(
            task_request.scheduled_date
            if "scheduled_date" in supplied_fields
            else task.scheduled_date
        ),
        start_time=(
            parse_start_time(task_request.start_time)
            if "start_time" in supplied_fields
            else task.start_time
        ),
        planned_minutes=(
            task_request.planned_minutes
            if "planned_minutes" in supplied_fields
            else task.planned_minutes
        ),
    )
    # The star control updates importance directly in the frontend and does not reopen
    # the task form's duplicate/overlap confirmation flow.
    if not task_request.confirm_warnings and supplied_fields != {"important"}:
        warnings = find_scheduling_warnings(
            candidate,
            await get_owned_tasks(database_session, user_id),
        )
        if warnings:
            raise TaskSchedulingWarningError(warnings)

    for field_name in supplied_fields:
        field_value = getattr(task_request, field_name)
        if field_name == "start_time":
            field_value = parse_start_time(field_value)
        setattr(task, field_name, field_value)

    if schedule_changed:
        if task.completion_state == "partial":
            task.actual_completed_minutes = Decimal(task.planned_minutes) / 2
        elif task.completion_state == "completed":
            task.actual_completed_minutes = Decimal(task.planned_minutes)
    task.updated_at = current_time
    try:
        await database_session.flush()
    except StaleDataError as error:
        raise TaskVersionConflictError from error
    await record_activity(
        database_session,
        user_id,
        local_activity_date(task, current_time),
        current_time,
    )
    return create_task_response(task, category)


@router.patch("/{task_id}/completion", response_model=TaskResponse)
async def update_task_completion(
    task_id: UUID,
    completion_request: TaskCompletionRequest,
    authenticated_user: Annotated[AuthenticatedUser, Depends(get_authenticated_user)],
    database_session: Annotated[
        AsyncSession,
        Depends(get_authenticated_database_session),
    ],
) -> TaskResponse:
    user_id = authenticated_user.user_id
    task, category = await get_owned_task(database_session, user_id, task_id)
    ensure_task_version(task, completion_request.version)
    current_time = get_current_time()
    activity_date = local_activity_date(task, current_time)
    action = completion_request.action

    if action == "complete":
        if task.completion_state not in {"pending", "partial"}:
            raise TaskTransitionError
        task.actual_completed_minutes = Decimal(task.planned_minutes)
        task.completion_state = "completed"
        task.completed_at = current_time
        if task.scheduled_date <= activity_date:
            completion_statement = (
                insert(CompletionEvent)
                .values(
                    id=uuid4(),
                    user_id=user_id,
                    task_id=task.id,
                    completed_at=current_time,
                )
                .on_conflict_do_nothing(
                    index_elements=[CompletionEvent.user_id, CompletionEvent.task_id],
                )
            )
            await database_session.execute(completion_statement)
    elif action == "toggle_partial":
        if task.completion_state not in {"pending", "partial"}:
            raise TaskTransitionError
        if task.completion_state == "partial":
            task.actual_completed_minutes = Decimal("0")
            task.completion_state = "pending"
        else:
            task.actual_completed_minutes = Decimal(task.planned_minutes) / 2
            task.completion_state = "partial"
        task.completed_at = None
    elif action == "mark_incomplete":
        if task.completion_state not in {"pending", "partial"}:
            raise TaskTransitionError
        task.actual_completed_minutes = Decimal("0")
        task.completion_state = "incomplete"
        task.completed_at = None
        await remove_completion_event(database_session, user_id, task.id)
    else:
        if task.completion_state == "pending":
            raise TaskTransitionError
        candidate = TaskCandidate(
            id=task.id,
            title=task.title,
            scheduled_date=task.scheduled_date,
            start_time=task.start_time,
            planned_minutes=task.planned_minutes,
        )
        if not completion_request.confirm_warnings:
            warnings = find_scheduling_warnings(
                candidate,
                await get_owned_tasks(database_session, user_id),
            )
            overlap_warnings = {
                key: value for key, value in warnings.items() if key == "overlapping_tasks"
            }
            if overlap_warnings:
                raise TaskSchedulingWarningError(overlap_warnings)
        task.actual_completed_minutes = Decimal("0")
        task.completion_state = "pending"
        task.completed_at = None
        await remove_completion_event(database_session, user_id, task.id)

    task.updated_at = current_time
    try:
        await database_session.flush()
    except StaleDataError as error:
        raise TaskVersionConflictError from error
    await record_activity(database_session, user_id, activity_date, current_time)
    return create_task_response(task, category)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: UUID,
    version: Annotated[int, Query(ge=1)],
    authenticated_user: Annotated[AuthenticatedUser, Depends(get_authenticated_user)],
    database_session: Annotated[
        AsyncSession,
        Depends(get_authenticated_database_session),
    ],
) -> Response:
    task, _category = await get_owned_task(
        database_session,
        authenticated_user.user_id,
        task_id,
    )
    ensure_task_version(task, version)
    await database_session.delete(task)
    try:
        await database_session.flush()
    except StaleDataError as error:
        raise TaskVersionConflictError from error
    return Response(status_code=status.HTTP_204_NO_CONTENT)
