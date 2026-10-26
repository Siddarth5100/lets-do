import asyncio
from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock, Mock

import httpx2
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_database_session
from app.main import app


def get_response(path: str) -> httpx2.Response:
    async def send_request() -> httpx2.Response:
        transport = httpx2.ASGITransport(app=app)
        async with httpx2.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            return await client.get(path)

    return asyncio.run(send_request())


def test_application_health_check() -> None:
    response = get_response("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "lets-do-backend"}


def test_database_health_check() -> None:
    database_session = AsyncMock(spec=AsyncSession)
    query_result = Mock()
    query_result.scalar_one.return_value = 1
    database_session.execute.return_value = query_result

    async def provide_database_session() -> AsyncGenerator[AsyncSession, None]:
        yield database_session

    app.dependency_overrides[get_database_session] = provide_database_session

    try:
        response = get_response("/health/database")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "reachable"}


def test_database_health_check_returns_structured_error() -> None:
    database_session = AsyncMock(spec=AsyncSession)
    database_session.execute.side_effect = OperationalError(
        statement="SELECT 1",
        params={},
        orig=ConnectionError("database unavailable"),
    )

    async def provide_database_session() -> AsyncGenerator[AsyncSession, None]:
        yield database_session

    app.dependency_overrides[get_database_session] = provide_database_session

    try:
        response = get_response("/health/database")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503
    assert response.json() == {
        "error": {
            "code": "database_unavailable",
            "message": "The database is currently unavailable.",
        }
    }


def test_unknown_route_returns_structured_error() -> None:
    response = get_response("/missing")

    assert response.status_code == 404
    assert response.json() == {
        "error": {
            "code": "http_error",
            "message": "Not Found",
        }
    }
