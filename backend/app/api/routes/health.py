import logging
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DatabaseUnavailableError
from app.db.session import get_database_session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/health", tags=["health"])


class ApplicationHealthResponse(BaseModel):
    status: Literal["ok"]
    service: str


class DatabaseHealthResponse(BaseModel):
    status: Literal["ok"]
    database: Literal["reachable"]


@router.get("", response_model=ApplicationHealthResponse)
async def check_application_health() -> ApplicationHealthResponse:
    return ApplicationHealthResponse(status="ok", service="lets-do-backend")


@router.get("/database", response_model=DatabaseHealthResponse)
async def check_database_health(
    database_session: Annotated[AsyncSession, Depends(get_database_session)],
) -> DatabaseHealthResponse:
    try:
        query_result = await database_session.execute(text("SELECT 1"))
        query_result.scalar_one()
    except SQLAlchemyError as error:
        logger.warning("Database health check failed: %s", error.__class__.__name__)
        raise DatabaseUnavailableError from error

    return DatabaseHealthResponse(status="ok", database="reachable")
