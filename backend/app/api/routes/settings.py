from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_authenticated_database_session, get_authenticated_user
from app.core.security import AuthenticatedUser
from app.core.time_zones import V1_TIME_ZONE_NAME, validate_v1_time_zone
from app.models import UserSettings

ThemeId = Literal[
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
]

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])


class UserSettingsRepresentation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    manual_theme_id: ThemeId | None
    sidebar_collapsed: StrictBool
    time_zone: str = Field(min_length=1, max_length=64)

    @field_validator("time_zone")
    @classmethod
    def validate_time_zone(cls, time_zone: str) -> str:
        return validate_v1_time_zone(time_zone, "time_zone")


def create_settings_response(settings: UserSettings | None) -> UserSettingsRepresentation:
    if settings is None:
        return UserSettingsRepresentation(
            manual_theme_id=None,
            sidebar_collapsed=False,
            time_zone=V1_TIME_ZONE_NAME,
        )

    return UserSettingsRepresentation(
        manual_theme_id=settings.manual_theme_id,
        sidebar_collapsed=settings.sidebar_collapsed,
        # Existing rows may contain a legacy zone. V1 has one effective zone and
        # normalizes the stored value the next time the user changes a setting.
        time_zone=V1_TIME_ZONE_NAME,
    )


@router.get("", response_model=UserSettingsRepresentation)
async def get_user_settings(
    authenticated_user: Annotated[AuthenticatedUser, Depends(get_authenticated_user)],
    database_session: Annotated[
        AsyncSession,
        Depends(get_authenticated_database_session),
    ],
) -> UserSettingsRepresentation:
    query = select(UserSettings).where(UserSettings.user_id == authenticated_user.user_id)
    settings = (await database_session.execute(query)).scalar_one_or_none()
    return create_settings_response(settings)


@router.put("", response_model=UserSettingsRepresentation)
async def update_user_settings(
    settings_update: UserSettingsRepresentation,
    authenticated_user: Annotated[AuthenticatedUser, Depends(get_authenticated_user)],
    database_session: Annotated[
        AsyncSession,
        Depends(get_authenticated_database_session),
    ],
) -> UserSettingsRepresentation:
    insert_statement = insert(UserSettings).values(
        user_id=authenticated_user.user_id,
        manual_theme_id=settings_update.manual_theme_id,
        sidebar_collapsed=settings_update.sidebar_collapsed,
        time_zone=settings_update.time_zone,
    )
    upsert_statement = insert_statement.on_conflict_do_update(
        index_elements=[UserSettings.user_id],
        set_={
            "manual_theme_id": insert_statement.excluded.manual_theme_id,
            "sidebar_collapsed": insert_statement.excluded.sidebar_collapsed,
            "time_zone": insert_statement.excluded.time_zone,
            "updated_at": func.now(),
        },
    ).returning(UserSettings)
    settings = (await database_session.execute(upsert_statement)).scalar_one()
    return create_settings_response(settings)
