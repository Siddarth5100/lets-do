import asyncio
from collections.abc import AsyncGenerator
from datetime import UTC, date, datetime, time
from decimal import Decimal
from typing import Any
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import httpx2
import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_authenticated_user
from app.api.routes import tasks as task_routes
from app.core.security import AuthenticatedUser
from app.db.session import get_database_session
from app.main import app
from app.models import Category, Task

TEST_USER_ID = UUID("635ca650-074e-47f6-a35d-9c824ac8e9a1")
TEST_USER = AuthenticatedUser(
    user_id=TEST_USER_ID,
    role="authenticated",
    email="planner@example.com",
)
FIXED_NOW = datetime(2026, 10, 23, 12, 0, tzinfo=UTC)


def create_category() -> Category:
    return Category(id=uuid4(), user_id=TEST_USER_ID, name="Work")


def create_task(
    category: Category,
    *,
    title: str = "Morning planning",
    scheduled_date: date = date(2026, 10, 23),
    start_time: time = time(9, 0),
    planned_minutes: int = 60,
    completion_state: str = "pending",
    actual_completed_minutes: Decimal = Decimal("0"),
    completed_at: datetime | None = None,
) -> Task:
    return Task(
        id=uuid4(),
        user_id=TEST_USER_ID,
        category_id=category.id,
        title=title,
        scheduled_date=scheduled_date,
        start_time=start_time,
        schedule_time_zone="UTC",
        planned_minutes=planned_minutes,
        reminder_enabled=False,
        reminder_minutes_before=10,
        actual_completed_minutes=actual_completed_minutes,
        completion_state=completion_state,
        important=False,
        completed_at=completed_at,
        version=1,
        created_at=datetime(2026, 10, 23, 8, 0, tzinfo=UTC),
        updated_at=datetime(2026, 10, 23, 8, 0, tzinfo=UTC),
    )


def create_task_request(category: Category, **overrides: Any) -> dict[str, Any]:
    request_body: dict[str, Any] = {
        "category_id": str(category.id),
        "title": "Write release notes",
        "scheduled_date": "2026-10-23",
        "start_time": "09:00",
        "schedule_time_zone": "UTC",
        "planned_minutes": 90,
        "reminder_enabled": True,
        "reminder_minutes_before": 15,
        "important": True,
    }
    request_body.update(overrides)
    return request_body


def scalar_result(value: Any) -> MagicMock:
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


def owned_task_result(task: Task | None, category: Category) -> MagicMock:
    result = MagicMock()
    result.one_or_none.return_value = None if task is None else (task, category)
    return result


def task_list_result(tasks: list[Task]) -> MagicMock:
    result = MagicMock()
    result.scalars.return_value.all.return_value = tasks
    return result


def send_task_request(
    method: str,
    path: str = "/api/v1/tasks",
    *,
    database_session: AsyncMock,
    json: dict[str, Any] | None = None,
    authenticated: bool = True,
) -> httpx2.Response:
    async def provide_database_session() -> AsyncGenerator[AsyncSession, None]:
        yield database_session

    async def provide_authenticated_user() -> AuthenticatedUser:
        return TEST_USER

    async def send_request() -> httpx2.Response:
        transport = httpx2.ASGITransport(app=app)
        async with httpx2.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            return await client.request(method, path, json=json)

    app.dependency_overrides[get_database_session] = provide_database_session
    if authenticated:
        app.dependency_overrides[get_authenticated_user] = provide_authenticated_user
    try:
        return asyncio.run(send_request())
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize(
    ("method", "path", "request_body"),
    [
        ("GET", "/api/v1/tasks", None),
        ("GET", f"/api/v1/tasks/{uuid4()}", None),
        ("POST", "/api/v1/tasks", {}),
        ("PATCH", f"/api/v1/tasks/{uuid4()}", {"important": True}),
        (
            "PATCH",
            f"/api/v1/tasks/{uuid4()}/completion",
            {"action": "complete"},
        ),
        ("DELETE", f"/api/v1/tasks/{uuid4()}", None),
    ],
)
def test_task_endpoints_require_authentication(
    method: str,
    path: str,
    request_body: dict[str, Any] | None,
) -> None:
    response = send_task_request(
        method,
        path,
        database_session=AsyncMock(spec=AsyncSession),
        json=request_body,
        authenticated=False,
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "authentication_required"


def test_get_tasks_returns_owned_tasks_in_schedule_order() -> None:
    category = create_category()
    task = create_task(category)
    rows_result = MagicMock()
    rows_result.all.return_value = [(task, category)]
    database_session = AsyncMock(spec=AsyncSession)
    database_session.execute.side_effect = [MagicMock(), rows_result]

    response = send_task_request("GET", database_session=database_session)

    assert response.status_code == 200
    assert response.json()[0] == {
        "id": str(task.id),
        "category_id": str(category.id),
        "category_name": "Work",
        "title": "Morning planning",
        "scheduled_date": "2026-10-23",
        "start_time": "09:00",
        "schedule_time_zone": "UTC",
        "planned_minutes": 60,
        "reminder_enabled": False,
        "reminder_minutes_before": 10,
        "actual_completed_minutes": 0.0,
        "completion_state": "pending",
        "important": False,
        "completed_at": None,
        "max_points": 1.0,
        "earned_points": 0.0,
        "version": 1,
        "created_at": "2026-10-23T08:00:00Z",
        "updated_at": "2026-10-23T08:00:00Z",
    }
    query = database_session.execute.await_args_list[1].args[0]
    compiled_query = query.compile(dialect=postgresql.dialect())
    assert TEST_USER_ID in compiled_query.params.values()
    assert "ORDER BY public.tasks.scheduled_date" in str(compiled_query)


def test_get_task_hides_missing_or_foreign_owned_tasks() -> None:
    category = create_category()
    database_session = AsyncMock(spec=AsyncSession)
    database_session.execute.side_effect = [MagicMock(), owned_task_result(None, category)]

    response = send_task_request(
        "GET",
        f"/api/v1/tasks/{uuid4()}",
        database_session=database_session,
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "task_not_found"


def test_create_task_uses_owned_category_and_records_activity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(task_routes, "get_current_time", lambda: FIXED_NOW)
    category = create_category()
    database_session = AsyncMock(spec=AsyncSession)
    database_session.execute.side_effect = [
        MagicMock(),
        scalar_result(category),
        task_list_result([]),
        MagicMock(),
    ]

    response = send_task_request(
        "POST",
        database_session=database_session,
        json=create_task_request(category, title="  Write release notes  "),
    )

    assert response.status_code == 201
    created_task = database_session.add.call_args.args[0]
    assert created_task.user_id == TEST_USER_ID
    assert created_task.title == "Write release notes"
    assert created_task.completion_state == "pending"
    assert created_task.actual_completed_minutes == 0
    assert response.json()["max_points"] == 1.5
    assert response.json()["earned_points"] == 0.0
    database_session.flush.assert_awaited_once_with()
    activity_statement = database_session.execute.await_args_list[-1].args[0]
    assert "ON CONFLICT" in str(activity_statement.compile(dialect=postgresql.dialect()))


def test_create_task_hides_missing_or_foreign_owned_category() -> None:
    category = create_category()
    database_session = AsyncMock(spec=AsyncSession)
    database_session.execute.side_effect = [MagicMock(), scalar_result(None)]

    response = send_task_request(
        "POST",
        database_session=database_session,
        json=create_task_request(category),
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "category_not_found"
    database_session.add.assert_not_called()


@pytest.mark.parametrize(
    "request_change",
    [
        {"title": "   "},
        {"title": "x" * 201},
        {"start_time": "24:00"},
        {"start_time": "9:00"},
        {"schedule_time_zone": "Not/AZone"},
        {"planned_minutes": 0},
        {"reminder_minutes_before": 12},
        {"unexpected": True},
    ],
)
def test_create_task_rejects_invalid_or_unexpected_fields(
    request_change: dict[str, Any],
) -> None:
    category = create_category()
    response = send_task_request(
        "POST",
        database_session=AsyncMock(spec=AsyncSession),
        json=create_task_request(category, **request_change),
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_create_task_returns_overridable_duplicate_and_overlap_warnings() -> None:
    category = create_category()
    existing_task = create_task(category, title="Morning   Planning")
    database_session = AsyncMock(spec=AsyncSession)
    database_session.execute.side_effect = [
        MagicMock(),
        scalar_result(category),
        task_list_result([existing_task]),
    ]

    response = send_task_request(
        "POST",
        database_session=database_session,
        json=create_task_request(
            category,
            title=" morning planning ",
            planned_minutes=30,
        ),
    )

    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "task_scheduling_warning"
    assert error["details"]["duplicate_tasks"][0]["id"] == str(existing_task.id)
    assert error["details"]["overlapping_tasks"][0]["id"] == str(existing_task.id)
    database_session.add.assert_not_called()


def test_conflict_detection_finds_cross_midnight_overlap_but_allows_adjacency() -> None:
    category = create_category()
    overnight_task = create_task(
        category,
        scheduled_date=date(2026, 10, 23),
        start_time=time(23, 30),
        planned_minutes=90,
    )
    overlapping_candidate = task_routes.TaskCandidate(
        id=None,
        title="After midnight",
        scheduled_date=date(2026, 10, 24),
        start_time=time(0, 30),
        planned_minutes=30,
    )
    adjacent_candidate = task_routes.TaskCandidate(
        id=None,
        title="Adjacent",
        scheduled_date=date(2026, 10, 24),
        start_time=time(1, 0),
        planned_minutes=30,
    )

    assert task_routes.find_scheduling_warnings(
        overlapping_candidate,
        [overnight_task],
    )["overlapping_tasks"]
    assert task_routes.find_scheduling_warnings(adjacent_candidate, [overnight_task]) == {}


def test_confirm_warnings_allows_task_creation(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(task_routes, "get_current_time", lambda: FIXED_NOW)
    category = create_category()
    existing_task = create_task(category)
    database_session = AsyncMock(spec=AsyncSession)
    database_session.execute.side_effect = [
        MagicMock(),
        scalar_result(category),
        task_list_result([existing_task]),
        MagicMock(),
    ]

    response = send_task_request(
        "POST",
        database_session=database_session,
        json=create_task_request(category, confirm_warnings=True),
    )

    assert response.status_code == 201
    database_session.add.assert_called_once()


def test_update_task_rechecks_strict_reschedule_cutoff(monkeypatch: pytest.MonkeyPatch) -> None:
    category = create_category()
    task = create_task(category, start_time=time(14, 0))
    monkeypatch.setattr(task_routes, "get_current_time", lambda: FIXED_NOW.replace(hour=13))
    database_session = AsyncMock(spec=AsyncSession)
    database_session.execute.side_effect = [MagicMock(), owned_task_result(task, category)]

    response = send_task_request(
        "PATCH",
        f"/api/v1/tasks/{task.id}",
        database_session=database_session,
        json={"start_time": "15:00"},
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "task_reschedule_unavailable"


def test_rescheduling_partial_task_keeps_exactly_half_progress(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    category = create_category()
    task = create_task(
        category,
        scheduled_date=date(2026, 10, 24),
        planned_minutes=90,
        completion_state="partial",
        actual_completed_minutes=Decimal("45"),
    )
    monkeypatch.setattr(task_routes, "get_current_time", lambda: FIXED_NOW)
    database_session = AsyncMock(spec=AsyncSession)
    database_session.execute.side_effect = [
        MagicMock(),
        owned_task_result(task, category),
        task_list_result([task]),
        MagicMock(),
    ]

    response = send_task_request(
        "PATCH",
        f"/api/v1/tasks/{task.id}",
        database_session=database_session,
        json={"planned_minutes": 45},
    )

    assert response.status_code == 200
    assert task.actual_completed_minutes == Decimal("22.5")
    assert response.json()["completion_state"] == "partial"
    assert response.json()["earned_points"] == 0.5


def test_toggling_important_skips_form_conflict_warnings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(task_routes, "get_current_time", lambda: FIXED_NOW)
    category = create_category()
    task = create_task(category)
    database_session = AsyncMock(spec=AsyncSession)
    database_session.execute.side_effect = [
        MagicMock(),
        owned_task_result(task, category),
        MagicMock(),
    ]

    response = send_task_request(
        "PATCH",
        f"/api/v1/tasks/{task.id}",
        database_session=database_session,
        json={"important": True},
    )

    assert response.status_code == 200
    assert task.important is True
    assert database_session.execute.await_count == 3


def test_complete_task_records_completion_and_activity(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(task_routes, "get_current_time", lambda: FIXED_NOW)
    category = create_category()
    task = create_task(category, planned_minutes=90)
    database_session = AsyncMock(spec=AsyncSession)
    database_session.execute.side_effect = [
        MagicMock(),
        owned_task_result(task, category),
        MagicMock(),
        MagicMock(),
    ]

    response = send_task_request(
        "PATCH",
        f"/api/v1/tasks/{task.id}/completion",
        database_session=database_session,
        json={"action": "complete"},
    )

    assert response.status_code == 200
    assert task.completion_state == "completed"
    assert task.actual_completed_minutes == 90
    assert task.completed_at == FIXED_NOW
    assert response.json()["earned_points"] == 1.5
    completion_statement = database_session.execute.await_args_list[2].args[0]
    assert "completion_events" in str(completion_statement)


def test_completing_future_task_does_not_record_completion_event(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(task_routes, "get_current_time", lambda: FIXED_NOW)
    category = create_category()
    task = create_task(category, scheduled_date=date(2026, 10, 24))
    database_session = AsyncMock(spec=AsyncSession)
    database_session.execute.side_effect = [
        MagicMock(),
        owned_task_result(task, category),
        MagicMock(),
    ]

    response = send_task_request(
        "PATCH",
        f"/api/v1/tasks/{task.id}/completion",
        database_session=database_session,
        json={"action": "complete"},
    )

    assert response.status_code == 200
    assert task.completion_state == "completed"
    assert database_session.execute.await_count == 3


@pytest.mark.parametrize(
    ("starting_state", "starting_minutes", "expected_state", "expected_minutes"),
    [
        ("pending", Decimal("0"), "partial", Decimal("22.5")),
        ("partial", Decimal("22.5"), "pending", Decimal("0")),
    ],
)
def test_toggle_partial_matches_frontend_half_progress_rule(
    monkeypatch: pytest.MonkeyPatch,
    starting_state: str,
    starting_minutes: Decimal,
    expected_state: str,
    expected_minutes: Decimal,
) -> None:
    monkeypatch.setattr(task_routes, "get_current_time", lambda: FIXED_NOW)
    category = create_category()
    task = create_task(
        category,
        planned_minutes=45,
        completion_state=starting_state,
        actual_completed_minutes=starting_minutes,
    )
    database_session = AsyncMock(spec=AsyncSession)
    database_session.execute.side_effect = [
        MagicMock(),
        owned_task_result(task, category),
        MagicMock(),
    ]

    response = send_task_request(
        "PATCH",
        f"/api/v1/tasks/{task.id}/completion",
        database_session=database_session,
        json={"action": "toggle_partial"},
    )

    assert response.status_code == 200
    assert task.completion_state == expected_state
    assert task.actual_completed_minutes == expected_minutes


def test_mark_incomplete_removes_completion_history_but_records_activity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(task_routes, "get_current_time", lambda: FIXED_NOW)
    category = create_category()
    task = create_task(category, completion_state="partial", actual_completed_minutes=Decimal("30"))
    database_session = AsyncMock(spec=AsyncSession)
    database_session.execute.side_effect = [
        MagicMock(),
        owned_task_result(task, category),
        MagicMock(),
        MagicMock(),
    ]

    response = send_task_request(
        "PATCH",
        f"/api/v1/tasks/{task.id}/completion",
        database_session=database_session,
        json={"action": "mark_incomplete"},
    )

    assert response.status_code == 200
    assert task.completion_state == "incomplete"
    delete_statement = database_session.execute.await_args_list[2].args[0]
    assert "DELETE FROM public.completion_events" in str(
        delete_statement.compile(dialect=postgresql.dialect())
    )


def test_reopen_requires_overlap_confirmation_and_then_removes_history(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(task_routes, "get_current_time", lambda: FIXED_NOW)
    category = create_category()
    completed_task = create_task(
        category,
        completion_state="completed",
        actual_completed_minutes=Decimal("60"),
        completed_at=FIXED_NOW,
    )
    overlapping_task = create_task(category, title="Another task", start_time=time(9, 30))

    warning_session = AsyncMock(spec=AsyncSession)
    warning_session.execute.side_effect = [
        MagicMock(),
        owned_task_result(completed_task, category),
        task_list_result([completed_task, overlapping_task]),
    ]
    warning_response = send_task_request(
        "PATCH",
        f"/api/v1/tasks/{completed_task.id}/completion",
        database_session=warning_session,
        json={"action": "reopen"},
    )
    assert warning_response.status_code == 409
    assert "duplicate_tasks" not in warning_response.json()["error"]["details"]

    confirmed_session = AsyncMock(spec=AsyncSession)
    confirmed_session.execute.side_effect = [
        MagicMock(),
        owned_task_result(completed_task, category),
        task_list_result([completed_task, overlapping_task]),
        MagicMock(),
        MagicMock(),
    ]
    confirmed_response = send_task_request(
        "PATCH",
        f"/api/v1/tasks/{completed_task.id}/completion",
        database_session=confirmed_session,
        json={"action": "reopen", "confirm_warnings": True},
    )

    assert confirmed_response.status_code == 200
    assert completed_task.completion_state == "pending"
    assert completed_task.actual_completed_minutes == 0
    assert completed_task.completed_at is None


def test_invalid_completion_transition_is_rejected() -> None:
    category = create_category()
    completed_task = create_task(
        category,
        completion_state="completed",
        actual_completed_minutes=Decimal("60"),
        completed_at=FIXED_NOW,
    )
    database_session = AsyncMock(spec=AsyncSession)
    database_session.execute.side_effect = [
        MagicMock(),
        owned_task_result(completed_task, category),
    ]

    response = send_task_request(
        "PATCH",
        f"/api/v1/tasks/{completed_task.id}/completion",
        database_session=database_session,
        json={"action": "complete"},
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "task_transition_invalid"


def test_delete_task_removes_only_the_owned_task_without_recording_activity() -> None:
    task_id = uuid4()
    delete_result = MagicMock()
    delete_result.scalar_one_or_none.return_value = task_id
    database_session = AsyncMock(spec=AsyncSession)
    database_session.execute.side_effect = [MagicMock(), delete_result]

    response = send_task_request(
        "DELETE",
        f"/api/v1/tasks/{task_id}",
        database_session=database_session,
    )

    assert response.status_code == 204
    statement = database_session.execute.await_args_list[1].args[0]
    compiled_statement = statement.compile(dialect=postgresql.dialect())
    assert TEST_USER_ID in compiled_statement.params.values()
    assert task_id in compiled_statement.params.values()
    assert database_session.execute.await_count == 2


def test_delete_task_hides_missing_or_foreign_owned_tasks() -> None:
    delete_result = MagicMock()
    delete_result.scalar_one_or_none.return_value = None
    database_session = AsyncMock(spec=AsyncSession)
    database_session.execute.side_effect = [MagicMock(), delete_result]

    response = send_task_request(
        "DELETE",
        f"/api/v1/tasks/{uuid4()}",
        database_session=database_session,
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "task_not_found"
