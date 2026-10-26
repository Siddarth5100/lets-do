from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.dependencies import get_authenticated_user
from app.core.security import AuthenticatedUser

router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])


class AuthenticatedUserResponse(BaseModel):
    user_id: UUID
    role: str
    email: str | None


@router.get("/me", response_model=AuthenticatedUserResponse)
async def get_current_user(
    authenticated_user: Annotated[AuthenticatedUser, Depends(get_authenticated_user)],
) -> AuthenticatedUserResponse:
    return AuthenticatedUserResponse(
        user_id=authenticated_user.user_id,
        role=authenticated_user.role,
        email=authenticated_user.email,
    )
