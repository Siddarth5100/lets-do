import asyncio
from collections.abc import AsyncGenerator
from datetime import UTC, date, datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import httpx2
import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_authenticated_user
from app.api.routes import activity as activity_routes
from app.core.security import AuthenticatedUser
from app.db.session import get_database_session
from app.main import app
from app.models import CompletionEvent

TEST_USER_ID = UUID("635ca650-074e-47f6-a35d-9c824ac8e9a1")
TEST_USER = AuthenticatedUser(
    user_id=TEST_USER_ID,
    role="authenticated",
    email="planner@example.com",
)


def scalar_list_result(values: list[Any]) -> MagicMock:
    result = MagicMock()
    result.scalars.return_value.all.return_value = values
    return result


def send_activity_request(
    method: str,
    path: str = "/api/v1/activity",
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
        ("GET", "/api/v1/activity", None),
        ("POST", "/api/v1/activity/review", {"time_zone": "UTC"}),
    ],
)
def test_activity_endpoints_require_authentication(
    method: str,
    path: str,
    request_body: dict[str, Any] | None,
) -> None:
    response = send_activity_request(
        method,
        path,
        database_session=AsyncMock(spec=AsyncSession),
        json=request_body,
        authenticated=False,
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "authentication_required"


def test_get_activity_returns_owned_dates_and_completion_events_in_order() -> None:
    task_id = uuid4()
    completion_event = CompletionEvent(
        id=uuid4(),
        user_id=TEST_USER_ID,
        task_id=task_id,
        completed_at=datetime(2026, 10, 23, 10, 30, tzinfo=UTC),
    )
    database_session = AsyncMock(spec=AsyncSession)
    database_session.execute.side_effect = [
        MagicMock(),
        scalar_list_result([date(2026, 10, 22), date(2026, 10, 23)]),
        scalar_list_result([completion_event]),
    ]

    response = send_activity_request("GET", database_session=database_session)

    assert response.status_code == 200
    assert response.json() == {
        "activity_dates": ["2026-10-22", "2026-10-23"],
        "completion_events": [
            {
                "id": str(completion_event.id),
                "task_id": str(task_id),
                "completed_at": "2026-10-23T10:30:00Z",
            }
        ],
    }
    activity_query = database_session.execute.await_args_list[1].args[0]
    completion_query = database_session.execute.await_args_list[2].args[0]
    compiled_activity_query = activity_query.compile(dialect=postgresql.dialect())
    compiled_completion_query = completion_query.compile(dialect=postgresql.dialect())
    assert TEST_USER_ID in compiled_activity_query.params.values()
    assert TEST_USER_ID in compiled_completion_query.params.values()
    assert "ORDER BY public.activity_days.activity_date" in str(compiled_activity_query)
    assert "ORDER BY public.completion_events.completed_at" in str(
        compiled_completion_query
    )


def test_get_activity_returns_empty_collections() -> None:
    database_session = AsyncMock(spec=AsyncSession)
    database_session.execute.side_effect = [
        MagicMock(),
        scalar_list_result([]),
        scalar_list_result([]),
    ]

    response = send_activity_request("GET", database_session=database_session)

    assert response.status_code == 200
    assert response.json() == {"activity_dates": [], "completion_events": []}


def test_confirm_review_records_browser_local_date_idempotently(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    current_time = datetime(2026, 10, 23, 22, 30, tzinfo=UTC)
    monkeypatch.setattr(activity_routes, "get_current_time", lambda: current_time)
    database_session = AsyncMock(spec=AsyncSession)
    database_session.execute.side_effect = [MagicMock(), MagicMock()]

    response = send_activity_request(
        "POST",
        "/api/v1/activity/review",
        database_session=database_session,
        json={"time_zone": "Asia/Kolkata"},
    )

    assert response.status_code == 200
    assert response.json() == {"activity_date": "2026-10-24"}
    statement = database_session.execute.await_args_list[1].args[0]
    compiled_statement = statement.compile(dialect=postgresql.dialect())
    assert "INSERT INTO public.activity_days" in str(compiled_statement)
    assert "ON CONFLICT" in str(compiled_statement)
    assert TEST_USER_ID in compiled_statement.params.values()
    assert date(2026, 10, 24) in compiled_statement.params.values()


@pytest.mark.parametrize(
    "request_body",
    [
        {},
        {"time_zone": ""},
        {"time_zone": "Not/AZone"},
        {"time_zone": "UTC", "activity_date": "2026-10-23"},
    ],
)
def test_confirm_review_rejects_invalid_or_unexpected_fields(
    request_body: dict[str, Any],
) -> None:
    response = send_activity_request(
        "POST",
        "/api/v1/activity/review",
        database_session=AsyncMock(spec=AsyncSession),
        json=request_body,
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
