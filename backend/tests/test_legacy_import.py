import asyncio
import json
from collections.abc import AsyncGenerator
from decimal import Decimal
from typing import Any
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import httpx2
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_authenticated_user
from app.core.security import AuthenticatedUser
from app.db.session import get_database_session
from app.main import app
from app.services.legacy_import import create_import_digest, parse_legacy_planner_state

TEST_USER = AuthenticatedUser(
    user_id=UUID("635ca650-074e-47f6-a35d-9c824ac8e9a1"),
    role="authenticated",
    email="planner@example.com",
)


def legacy_task(**overrides: object) -> dict[str, object]:
    task: dict[str, object] = {
        "id": "legacy-task-1",
        "title": "Plan release",
        "category": "Work",
        "date": "2026-10-29",
        "startTime": "23:30",
        "plannedMinutes": 90,
        "reminder": {"enabled": True, "minutesBefore": 10},
        "actualCompletedMinutes": 45,
        "completionState": "partial",
        "important": True,
        "createdAt": "2026-10-28T08:00:00Z",
        "updatedAt": "2026-10-29T09:00:00Z",
        "completedAt": None,
    }
    task.update(overrides)
    return task


def send_import_request(
    path: str,
    request_body: dict[str, Any],
    *,
    authenticated: bool,
) -> httpx2.Response:
    database_session = AsyncMock(spec=AsyncSession)
    database_session.execute.return_value = MagicMock()

    async def provide_database_session() -> AsyncGenerator[AsyncSession, None]:
        yield database_session

    async def provide_authenticated_user() -> AuthenticatedUser:
        return TEST_USER

    async def send_request() -> httpx2.Response:
        transport = httpx2.ASGITransport(app=app)
        async with httpx2.AsyncClient(transport=transport, base_url="http://testserver") as client:
            return await client.post(path, json=request_body)

    app.dependency_overrides[get_database_session] = provide_database_session
    if authenticated:
        app.dependency_overrides[get_authenticated_user] = provide_authenticated_user
    try:
        return asyncio.run(send_request())
    finally:
        app.dependency_overrides.clear()


def test_parses_valid_v2_records_and_preserves_legacy_schedule_as_ist_metadata() -> None:
    serialized = json.dumps(
        {
            "version": 2,
            "tasks": [legacy_task()],
            "activityDates": ["2026-10-28"],
            "completionEvents": [
                {
                    "id": "event-1",
                    "taskId": None,
                    "completedAt": "2026-10-28T18:30:00Z",
                }
            ],
            "customCategories": ["Personal"],
            "settings": {"manualThemeId": "monday", "sidebarCollapsed": True},
        }
    )

    plan = parse_legacy_planner_state(serialized)

    assert plan.source_version == 2
    assert plan.tasks[0].scheduled_date.isoformat() == "2026-10-29"
    assert plan.tasks[0].start_time.isoformat() == "23:30:00"
    assert plan.tasks[0].actual_completed_minutes == Decimal("45")
    assert plan.tasks[0].completion_state == "partial"
    assert plan.category_names == ["Personal", "Work"]
    assert plan.activity_dates[0].isoformat() == "2026-10-28"
    assert len(plan.completion_events) == 1
    assert plan.issues == []


def test_parses_v1_completion_timestamps_and_links_matching_task() -> None:
    completion_timestamp = "2026-10-29T12:00:00Z"
    serialized = json.dumps(
        {
            "version": 1,
            "tasks": [
                legacy_task(
                    plannedMinutes=30,
                    actualCompletedMinutes=30,
                    completionState="completed",
                    completedAt=completion_timestamp,
                )
            ],
            "activityDates": [],
            "completionTimestamps": [completion_timestamp],
            "settings": {"manualThemeId": None, "sidebarCollapsed": False},
        }
    )

    plan = parse_legacy_planner_state(serialized)

    assert plan.tasks[0].completion_state == "completed"
    assert plan.completion_events[0].source_task_id == "legacy-task-1"
    assert plan.issues == []


def test_skips_invalid_records_individually_with_clear_reasons() -> None:
    serialized = json.dumps(
        {
            "version": 2,
            "tasks": [
                legacy_task(),
                legacy_task(id="invalid-task", actualCompletedMinutes=91),
                legacy_task(id="bad-time", startTime="25:00"),
            ],
            "activityDates": ["2026-10-28", "not-a-date"],
            "completionEvents": [],
            "customCategories": ["", "Health"],
            "settings": {},
        }
    )

    plan = parse_legacy_planner_state(serialized)

    assert [task.source_id for task in plan.tasks] == ["legacy-task-1"]
    assert plan.category_names == ["Health", "Work"]
    assert {issue.entity for issue in plan.issues} == {"task", "activity_date", "category"}
    assert any("exceed" in issue.reason for issue in plan.issues)


def test_preview_digest_binds_exact_payload_and_options() -> None:
    payload = '{"version":2,"tasks":[]}'

    digest = create_import_digest(payload, False)

    assert digest == create_import_digest(payload, False)
    assert digest != create_import_digest(payload + " ", False)
    assert digest != create_import_digest(payload, True)


def test_duplicate_linked_completion_events_are_skipped_without_losing_history_reason() -> None:
    completed_at = "2026-10-29T12:00:00Z"
    serialized = json.dumps(
        {
            "version": 2,
            "tasks": [
                legacy_task(
                    actualCompletedMinutes=90,
                    completionState="completed",
                    completedAt=completed_at,
                )
            ],
            "activityDates": [],
            "completionEvents": [
                {"id": "event-1", "taskId": "legacy-task-1", "completedAt": completed_at},
                {"id": "event-2", "taskId": "legacy-task-1", "completedAt": completed_at},
            ],
            "customCategories": [],
            "settings": {},
        }
    )

    plan = parse_legacy_planner_state(serialized)

    assert [event.source_id for event in plan.completion_events] == ["event-1"]
    assert any(issue.source_id == "event-2" and "Only one" in issue.reason for issue in plan.issues)


@pytest.mark.parametrize(
    "path",
    ["/api/v1/imports/local-storage/preview", "/api/v1/imports/local-storage"],
)
def test_import_endpoints_require_authentication(path: str) -> None:
    request_body: dict[str, Any] = {
        "serialized_state": '{"version":2,"tasks":[]}',
        "include_settings": False,
    }
    if path.endswith("local-storage"):
        request_body["preview_digest"] = "a" * 64

    response = send_import_request(path, request_body, authenticated=False)

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "authentication_required"


def test_commit_rejects_payload_that_does_not_match_preview_digest() -> None:
    response = send_import_request(
        "/api/v1/imports/local-storage",
        {
            "serialized_state": '{"version":2,"tasks":[]}',
            "include_settings": False,
            "preview_digest": "a" * 64,
        },
        authenticated=True,
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "import_preview_mismatch"
