from datetime import UTC, date, datetime
from typing import Annotated
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_authenticated_database_session, get_authenticated_user
from app.core.security import AuthenticatedUser
from app.models import ActivityDay, CompletionEvent

router = APIRouter(prefix="/api/v1/activity", tags=["activity"])


def get_current_time() -> datetime:
    return datetime.now(UTC)


class CompletionEventResponse(BaseModel):
    id: UUID
    task_id: UUID | None
    completed_at: datetime


class ActivityHistoryResponse(BaseModel):
    activity_dates: list[date]
    completion_events: list[CompletionEventResponse]


class ReviewConfirmationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    time_zone: str = Field(min_length=1, max_length=64)

    @field_validator("time_zone")
    @classmethod
    def validate_time_zone(cls, time_zone: str) -> str:
        try:
            ZoneInfo(time_zone)
        except (ValueError, ZoneInfoNotFoundError):
            raise ValueError("time_zone must be a valid IANA time zone") from None
        return time_zone


class ReviewConfirmationResponse(BaseModel):
    activity_date: date


@router.get("", response_model=ActivityHistoryResponse)
async def get_activity_history(
    authenticated_user: Annotated[AuthenticatedUser, Depends(get_authenticated_user)],
    database_session: Annotated[
        AsyncSession,
        Depends(get_authenticated_database_session),
    ],
) -> ActivityHistoryResponse:
    user_id = authenticated_user.user_id
    activity_query = (
        select(ActivityDay.activity_date)
        .where(ActivityDay.user_id == user_id)
        .order_by(ActivityDay.activity_date)
    )
    activity_dates = list((await database_session.execute(activity_query)).scalars().all())

    completion_query = (
        select(CompletionEvent)
        .where(CompletionEvent.user_id == user_id)
        .order_by(CompletionEvent.completed_at, CompletionEvent.id)
    )
    completion_events = (
        (await database_session.execute(completion_query)).scalars().all()
    )
    return ActivityHistoryResponse(
        activity_dates=activity_dates,
        completion_events=[
            CompletionEventResponse(
                id=event.id,
                task_id=event.task_id,
                completed_at=event.completed_at,
            )
            for event in completion_events
        ],
    )


@router.post("/review", response_model=ReviewConfirmationResponse)
async def confirm_daily_review(
    review_request: ReviewConfirmationRequest,
    authenticated_user: Annotated[AuthenticatedUser, Depends(get_authenticated_user)],
    database_session: Annotated[
        AsyncSession,
        Depends(get_authenticated_database_session),
    ],
) -> ReviewConfirmationResponse:
    current_time = get_current_time()
    activity_date = current_time.astimezone(ZoneInfo(review_request.time_zone)).date()
    statement = (
        insert(ActivityDay)
        .values(
            user_id=authenticated_user.user_id,
            activity_date=activity_date,
            recorded_at=current_time,
        )
        .on_conflict_do_nothing(
            index_elements=[ActivityDay.user_id, ActivityDay.activity_date],
        )
    )
    await database_session.execute(statement)
    return ReviewConfirmationResponse(activity_date=activity_date)
