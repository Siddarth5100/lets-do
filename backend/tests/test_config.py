import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_settings_accept_postgresql_psycopg_url() -> None:
    settings = Settings(database_url="postgresql+psycopg://user:password@localhost:5432/database")

    assert settings.database_url.startswith("postgresql+psycopg://")


def test_settings_normalizes_standard_postgresql_url() -> None:
    settings = Settings(database_url="postgresql://user:password@localhost:5432/database")

    assert settings.database_url.startswith("postgresql+psycopg://")


def test_settings_reject_non_postgresql_url() -> None:
    with pytest.raises(ValidationError):
        Settings(database_url="sqlite:///temporary.db")


def test_settings_derives_supabase_auth_urls() -> None:
    settings = Settings(
        database_url="postgresql+psycopg://user:password@localhost:5432/database",
        supabase_url="https://example-project.supabase.co",
    )

    assert settings.supabase_auth_issuer == "https://example-project.supabase.co/auth/v1"
    assert settings.supabase_jwks_url == (
        "https://example-project.supabase.co/auth/v1/.well-known/jwks.json"
    )


def test_settings_rejects_empty_jwt_audience() -> None:
    with pytest.raises(ValidationError):
        Settings(
            database_url="postgresql+psycopg://user:password@localhost:5432/database",
            supabase_url="https://example-project.supabase.co",
            supabase_jwt_audience=" ",
        )
