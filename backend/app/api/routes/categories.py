from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import delete, exists, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_authenticated_database_session, get_authenticated_user
from app.core.errors import (
    CategoryInUseError,
    CategoryNameConflictError,
    CategoryNotFoundError,
)
from app.core.security import AuthenticatedUser
from app.models import Category, Task

CATEGORY_NAME_INDEX = "uq_categories_user_normalized_name"

router = APIRouter(prefix="/api/v1/categories", tags=["categories"])


class CategoryNameRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=100)

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, name: object) -> object:
        return name.strip() if isinstance(name, str) else name


class CategoryResponse(BaseModel):
    id: UUID
    name: str


def create_category_response(category: Category) -> CategoryResponse:
    return CategoryResponse(id=category.id, name=category.name)


def is_category_name_conflict(error: IntegrityError) -> bool:
    diagnostic = getattr(error.orig, "diag", None)
    return getattr(diagnostic, "constraint_name", None) == CATEGORY_NAME_INDEX


@router.get("", response_model=list[CategoryResponse])
async def get_categories(
    authenticated_user: Annotated[AuthenticatedUser, Depends(get_authenticated_user)],
    database_session: Annotated[
        AsyncSession,
        Depends(get_authenticated_database_session),
    ],
) -> list[CategoryResponse]:
    query = (
        select(Category)
        .where(Category.user_id == authenticated_user.user_id)
        .order_by(func.lower(Category.name), Category.id)
    )
    categories = (await database_session.execute(query)).scalars().all()
    return [create_category_response(category) for category in categories]


@router.post("", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    category_request: CategoryNameRequest,
    authenticated_user: Annotated[AuthenticatedUser, Depends(get_authenticated_user)],
    database_session: Annotated[
        AsyncSession,
        Depends(get_authenticated_database_session),
    ],
) -> CategoryResponse:
    category = Category(
        id=uuid4(),
        user_id=authenticated_user.user_id,
        name=category_request.name,
    )
    database_session.add(category)
    try:
        await database_session.flush()
    except IntegrityError as error:
        if is_category_name_conflict(error):
            raise CategoryNameConflictError from error
        raise

    return create_category_response(category)


@router.patch("/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: UUID,
    category_request: CategoryNameRequest,
    authenticated_user: Annotated[AuthenticatedUser, Depends(get_authenticated_user)],
    database_session: Annotated[
        AsyncSession,
        Depends(get_authenticated_database_session),
    ],
) -> CategoryResponse:
    query = select(Category).where(
        Category.id == category_id,
        Category.user_id == authenticated_user.user_id,
    )
    category = (await database_session.execute(query)).scalar_one_or_none()
    if category is None:
        raise CategoryNotFoundError

    category.name = category_request.name
    try:
        await database_session.flush()
    except IntegrityError as error:
        if is_category_name_conflict(error):
            raise CategoryNameConflictError from error
        raise

    return create_category_response(category)


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: UUID,
    authenticated_user: Annotated[AuthenticatedUser, Depends(get_authenticated_user)],
    database_session: Annotated[
        AsyncSession,
        Depends(get_authenticated_database_session),
    ],
) -> Response:
    user_id = authenticated_user.user_id
    task_uses_category = exists().where(
        Task.user_id == user_id,
        Task.category_id == Category.id,
    )
    delete_statement = (
        delete(Category)
        .where(
            Category.id == category_id,
            Category.user_id == user_id,
            ~task_uses_category,
        )
        .returning(Category.id)
    )
    deleted_category_id = (await database_session.execute(delete_statement)).scalar_one_or_none()
    if deleted_category_id is not None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    category_exists_query = select(
        exists().where(
            Category.id == category_id,
            Category.user_id == user_id,
        )
    )
    category_exists = (await database_session.execute(category_exists_query)).scalar_one()
    if category_exists:
        raise CategoryInUseError
    raise CategoryNotFoundError
