import asyncio

import httpx2

from app.core.config import Settings
from app.main import create_application


def send_preflight_request(origin: str) -> httpx2.Response:
    settings = Settings(
        app_environment="test",
        database_url="postgresql+psycopg://user:password@localhost:5432/database",
        supabase_url="https://example-project.supabase.co",
        cors_allowed_origins="https://app.example.com",
        _env_file=None,
    )
    application = create_application(settings)

    async def send_request() -> httpx2.Response:
        transport = httpx2.ASGITransport(app=application)
        async with httpx2.AsyncClient(transport=transport, base_url="http://testserver") as client:
            return await client.options(
                "/api/v1/auth/me",
                headers={
                    "Origin": origin,
                    "Access-Control-Request-Method": "GET",
                    "Access-Control-Request-Headers": "Authorization",
                },
            )

    return asyncio.run(send_request())


def test_cors_allows_configured_exact_origin() -> None:
    response = send_preflight_request("https://app.example.com")

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://app.example.com"


def test_cors_does_not_allow_unconfigured_origin() -> None:
    response = send_preflight_request("https://unexpected.example.com")

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers
