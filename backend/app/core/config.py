from functools import lru_cache
from typing import Literal

from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Let's Do API"
    app_environment: Literal["development", "test", "production"] = "development"
    app_debug: bool = False
    database_url: str
    migration_database_url: str | None = None
    supabase_url: AnyHttpUrl
    supabase_jwt_audience: str = "authenticated"

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

    @property
    def supabase_auth_issuer(self) -> str:
        return f"{str(self.supabase_url).rstrip('/')}/auth/v1"

    @property
    def supabase_jwks_url(self) -> str:
        return f"{self.supabase_auth_issuer}/.well-known/jwks.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()
