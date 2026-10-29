import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_settings_accept_postgresql_psycopg_url() -> None:
    settings = Settings(database_url="postgresql+psycopg://user:password@localhost:5432/database")

    assert settings.database_url.startswith("postgresql+psycopg://")


def test_settings_normalizes_standard_postgresql_url() -> None:
    settings = Settings(database_url="postgresql://user:password@localhost:5432/database")

    assert settings.database_url.startswith("postgresql+psycopg://")


def test_settings_normalizes_migration_database_url() -> None:
    settings = Settings(
        database_url="postgresql+psycopg://runtime:password@localhost:5432/database",
        migration_database_url="postgresql://owner:password@localhost:5432/database",
    )

    assert settings.migration_database_url == (
        "postgresql+psycopg://owner:password@localhost:5432/database"
    )


def test_settings_requires_separate_migration_database_url_for_alembic() -> None:
    settings = Settings(
        database_url="postgresql+psycopg://runtime:password@localhost:5432/database",
        supabase_url="https://example-project.supabase.co",
        _env_file=None,
    )

    with pytest.raises(RuntimeError, match="MIGRATION_DATABASE_URL"):
        settings.require_migration_database_url()


def test_settings_reject_non_postgresql_url() -> None:
    with pytest.raises(ValidationError):
        Settings(database_url="sqlite:///temporary.db")


def test_settings_rejects_non_postgresql_migration_url() -> None:
    with pytest.raises(ValidationError):
        Settings(
            database_url="postgresql+psycopg://runtime:password@localhost:5432/database",
            migration_database_url="sqlite:///temporary.db",
        )


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


def test_settings_normalizes_exact_cors_origins() -> None:
    settings = Settings(
        database_url="postgresql+psycopg://user:password@localhost:5432/database",
        supabase_url="https://example-project.supabase.co",
        cors_allowed_origins=" https://app.example.com/,https://admin.example.com ",
        _env_file=None,
    )

    assert settings.allowed_cors_origins == [
        "https://app.example.com",
        "https://admin.example.com",
    ]


@pytest.mark.parametrize(
    "configured_origins",
    ["*", "https://example.com/path", "https://user@example.com", "example.com"],
)
def test_settings_rejects_invalid_cors_origins(configured_origins: str) -> None:
    with pytest.raises(ValidationError):
        Settings(
            database_url="postgresql+psycopg://user:password@localhost:5432/database",
            supabase_url="https://example-project.supabase.co",
            cors_allowed_origins=configured_origins,
            _env_file=None,
        )


@pytest.mark.parametrize("ssl_mode", ["require", "verify-ca", "verify-full"])
def test_production_settings_accept_supported_postgresql_tls_modes(ssl_mode: str) -> None:
    settings = Settings(
        app_environment="production",
        database_url=(
            "postgresql+psycopg://user:password@database.example.com:5432/database"
            f"?sslmode={ssl_mode}"
        ),
        supabase_url="https://example-project.supabase.co",
        cors_allowed_origins="https://app.example.com",
        _env_file=None,
    )

    assert settings.app_environment == "production"


@pytest.mark.parametrize("database_query", ["", "?sslmode=disable", "?ssl=true"])
def test_production_settings_reject_missing_or_unsupported_postgresql_tls(
    database_query: str,
) -> None:
    with pytest.raises(ValidationError, match="secure PostgreSQL sslmode"):
        Settings(
            app_environment="production",
            database_url=(
                "postgresql+psycopg://user:password@database.example.com:5432/database"
                f"{database_query}"
            ),
            supabase_url="https://example-project.supabase.co",
            cors_allowed_origins="https://app.example.com",
            _env_file=None,
        )


def test_production_settings_require_https_frontend_origin() -> None:
    with pytest.raises(ValidationError, match="CORS_ALLOWED_ORIGINS must use HTTPS"):
        Settings(
            app_environment="production",
            database_url=(
                "postgresql+psycopg://user:password@database.example.com:5432/database"
                "?sslmode=require"
            ),
            supabase_url="https://example-project.supabase.co",
            cors_allowed_origins="http://app.example.com",
            _env_file=None,
        )


def test_production_settings_validate_migration_database_tls_when_configured() -> None:
    with pytest.raises(ValidationError, match="MIGRATION_DATABASE_URL"):
        Settings(
            app_environment="production",
            database_url=(
                "postgresql+psycopg://runtime:password@database.example.com:5432/database"
                "?sslmode=require"
            ),
            migration_database_url=(
                "postgresql+psycopg://owner:password@database.example.com:5432/database"
            ),
            supabase_url="https://example-project.supabase.co",
            cors_allowed_origins="https://app.example.com",
            _env_file=None,
        )
