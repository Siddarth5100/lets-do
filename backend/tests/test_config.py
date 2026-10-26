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
