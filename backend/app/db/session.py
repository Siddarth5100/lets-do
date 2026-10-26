from collections.abc import AsyncGenerator
from functools import lru_cache

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings


@lru_cache
def get_database_engine() -> AsyncEngine:
    return create_async_engine(
        get_settings().database_url,
        pool_pre_ping=True,
    )


@lru_cache
def get_session_factory() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(
        bind=get_database_engine(),
        autoflush=False,
        expire_on_commit=False,
    )


async def get_database_session() -> AsyncGenerator[AsyncSession, None]:
    async with get_session_factory()() as database_session:
        try:
            yield database_session
        except Exception:
            await database_session.rollback()
            raise
