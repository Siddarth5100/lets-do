from functools import lru_cache
from typing import Literal
from urllib.parse import urlsplit

from pydantic import AnyHttpUrl, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url

SECURE_POSTGRESQL_SSL_MODES = {"require", "verify-ca", "verify-full"}


class Settings(BaseSettings):
    app_name: str = "Let's Do API"
    app_environment: Literal["development", "test", "production"] = "development"
    app_debug: bool = False
    database_url: str
    migration_database_url: str | None = None
    supabase_url: AnyHttpUrl
    supabase_jwt_audience: str = "authenticated"
    cors_allowed_origins: str = "http://localhost:5173"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("database_url", "migration_database_url")
    @classmethod
    def validate_database_url(cls, database_url: str | None) -> str | None:
        if database_url is None:
            return None
        if database_url.startswith("postgresql://"):
            return database_url.replace("postgresql://", "postgresql+psycopg://", 1)
        if not database_url.startswith("postgresql+psycopg://"):
            raise ValueError("Database URLs must use PostgreSQL with the psycopg driver")
        return database_url

    def require_migration_database_url(self) -> str:
        if self.migration_database_url is None:
            raise RuntimeError("MIGRATION_DATABASE_URL is required for Alembic commands")
        return self.migration_database_url

    @field_validator("supabase_jwt_audience")
    @classmethod
    def validate_supabase_jwt_audience(cls, audience: str) -> str:
        if not audience.strip():
            raise ValueError("SUPABASE_JWT_AUDIENCE must not be empty")
        return audience

    @field_validator("cors_allowed_origins")
    @classmethod
    def validate_cors_allowed_origins(cls, configured_origins: str) -> str:
        normalized_origins: list[str] = []
        for configured_origin in configured_origins.split(","):
            origin = configured_origin.strip().rstrip("/")
            if not origin:
                continue

            parsed_origin = urlsplit(origin)
            if (
                parsed_origin.scheme not in {"http", "https"}
                or not parsed_origin.netloc
                or parsed_origin.username is not None
                or parsed_origin.password is not None
                or parsed_origin.path
                or parsed_origin.query
                or parsed_origin.fragment
            ):
                raise ValueError(
                    "CORS_ALLOWED_ORIGINS must contain comma-separated HTTP(S) origins"
                )
            if origin == "*":
                raise ValueError("CORS_ALLOWED_ORIGINS must not contain a wildcard")
            if origin not in normalized_origins:
                normalized_origins.append(origin)

        return ",".join(normalized_origins)

    @model_validator(mode="after")
    def validate_production_configuration(self) -> "Settings":
        if self.app_environment != "production":
            return self

        if self.app_debug:
            raise ValueError("APP_DEBUG must be false in production")
        if self.supabase_url.scheme != "https":
            raise ValueError("SUPABASE_URL must use HTTPS in production")
        if not self.allowed_cors_origins:
            raise ValueError("CORS_ALLOWED_ORIGINS must be configured in production")
        if any(not origin.startswith("https://") for origin in self.allowed_cors_origins):
            raise ValueError("CORS_ALLOWED_ORIGINS must use HTTPS in production")

        self._validate_production_database_tls("DATABASE_URL", self.database_url)
        if self.migration_database_url is not None:
            self._validate_production_database_tls(
                "MIGRATION_DATABASE_URL",
                self.migration_database_url,
            )
        return self

    @staticmethod
    def _validate_production_database_tls(variable_name: str, database_url: str) -> None:
        ssl_mode = make_url(database_url).query.get("sslmode")
        if not isinstance(ssl_mode, str) or ssl_mode.casefold() not in SECURE_POSTGRESQL_SSL_MODES:
            supported_modes = ", ".join(sorted(SECURE_POSTGRESQL_SSL_MODES))
            raise ValueError(
                f"{variable_name} must set a secure PostgreSQL sslmode "
                f"({supported_modes}) in production"
            )

    @property
    def allowed_cors_origins(self) -> list[str]:
        return [origin for origin in self.cors_allowed_origins.split(",") if origin]

    @property
    def supabase_auth_issuer(self) -> str:
        return f"{str(self.supabase_url).rstrip('/')}/auth/v1"

    @property
    def supabase_jwks_url(self) -> str:
        return f"{self.supabase_auth_issuer}/.well-known/jwks.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()
