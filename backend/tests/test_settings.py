import asyncio
from collections.abc import AsyncGenerator
from typing import Any
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import httpx2
import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_authenticated_user
from app.core.security import AuthenticatedUser
from app.db.session import get_database_session
from app.main import app
from app.models import UserSettings

TEST_USER_ID = UUID("635ca650-074e-47f6-a35d-9c824ac8e9a1")
TEST_USER = AuthenticatedUser(
    user_id=TEST_USER_ID,
    role="authenticated",
    email="planner@example.com",
)


def send_settings_request(
    method: str,
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
            return await client.request(method, "/api/v1/settings", json=json)

    app.dependency_overrides[get_database_session] = provide_database_session
    if authenticated:
        app.dependency_overrides[get_authenticated_user] = provide_authenticated_user
    try:
        return asyncio.run(send_request())
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize("method", ["GET", "PUT"])
def test_settings_endpoints_require_authentication(method: str) -> None:
    database_session = AsyncMock(spec=AsyncSession)
    request_body = (
        {
            "manual_theme_id": None,
            "sidebar_collapsed": False,
            "time_zone": "UTC",
        }
        if method == "PUT"
        else None
    )

    response = send_settings_request(
        method,
        database_session=database_session,
        json=request_body,
        authenticated=False,
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "authentication_required"


def test_get_settings_returns_authenticated_users_settings() -> None:
    stored_settings = UserSettings(
        user_id=TEST_USER_ID,
        manual_theme_id="tuesday",
        sidebar_collapsed=True,
        time_zone="Asia/Kolkata",
    )
    query_result = MagicMock()
    query_result.scalar_one_or_none.return_value = stored_settings
    database_session = AsyncMock(spec=AsyncSession)
    database_session.execute.side_effect = [MagicMock(), query_result]

    response = send_settings_request("GET", database_session=database_session)

    assert response.status_code == 200
    assert response.json() == {
        "manual_theme_id": "tuesday",
        "sidebar_collapsed": True,
        "time_zone": "Asia/Kolkata",
    }
    query = database_session.execute.await_args_list[1].args[0]
    compiled_query = query.compile(dialect=postgresql.dialect())
    assert TEST_USER_ID in compiled_query.params.values()
    database_session.commit.assert_awaited_once_with()


def test_get_settings_returns_defaults_without_creating_a_row() -> None:
    query_result = MagicMock()
    query_result.scalar_one_or_none.return_value = None
    database_session = AsyncMock(spec=AsyncSession)
    database_session.execute.side_effect = [MagicMock(), query_result]

    response = send_settings_request("GET", database_session=database_session)

    assert response.status_code == 200
    assert response.json() == {
        "manual_theme_id": None,
        "sidebar_collapsed": False,
        "time_zone": "UTC",
    }
    assert database_session.add.call_count == 0


def test_put_settings_uses_an_atomic_user_owned_upsert() -> None:
    stored_settings = UserSettings(
        user_id=TEST_USER_ID,
        manual_theme_id=None,
        sidebar_collapsed=True,
        time_zone="America/New_York",
    )
    upsert_result = MagicMock()
    upsert_result.scalar_one.return_value = stored_settings
    database_session = AsyncMock(spec=AsyncSession)
    database_session.execute.side_effect = [MagicMock(), upsert_result]
    request_body = {
        "manual_theme_id": None,
        "sidebar_collapsed": True,
        "time_zone": "America/New_York",
    }

    response = send_settings_request(
        "PUT",
        database_session=database_session,
        json=request_body,
    )

    assert response.status_code == 200
    assert response.json() == request_body
    upsert = database_session.execute.await_args_list[1].args[0]
    compiled_upsert = upsert.compile(dialect=postgresql.dialect())
    assert "ON CONFLICT (user_id) DO UPDATE" in str(compiled_upsert)
    assert TEST_USER_ID in compiled_upsert.params.values()
    assert "updated_at = now()" in str(compiled_upsert)
    database_session.commit.assert_awaited_once_with()


@pytest.mark.parametrize(
    "request_body",
    [
        {
            "manual_theme_id": "workday",
            "sidebar_collapsed": False,
            "time_zone": "UTC",
        },
        {
            "manual_theme_id": None,
            "sidebar_collapsed": False,
            "time_zone": "Not/A_Time_Zone",
        },
        {
            "manual_theme_id": None,
            "sidebar_collapsed": False,
            "time_zone": "x" * 65,
        },
        {
            "manual_theme_id": None,
            "sidebar_collapsed": "false",
            "time_zone": "UTC",
        },
        {
            "manual_theme_id": None,
            "sidebar_collapsed": False,
        },
        {
            "manual_theme_id": None,
            "sidebar_collapsed": False,
            "time_zone": "UTC",
            "user_id": str(TEST_USER_ID),
        },
    ],
)
def test_put_settings_rejects_invalid_or_unexpected_fields(
    request_body: dict[str, Any],
) -> None:
    database_session = AsyncMock(spec=AsyncSession)

    response = send_settings_request(
        "PUT",
        database_session=database_session,
        json=request_body,
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
