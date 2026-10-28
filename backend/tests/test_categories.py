import asyncio
from collections.abc import AsyncGenerator
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import httpx2
import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_authenticated_user
from app.core.security import AuthenticatedUser
from app.db.session import get_database_session
from app.main import app
from app.models import Category

TEST_USER_ID = UUID("635ca650-074e-47f6-a35d-9c824ac8e9a1")
TEST_USER = AuthenticatedUser(
    user_id=TEST_USER_ID,
    role="authenticated",
    email="planner@example.com",
)


def send_category_request(
    method: str,
    path: str = "/api/v1/categories",
    *,
    database_session: AsyncMock,
    json: dict[str, Any] | None = None,
    authenticated: bool = True,
) -> httpx2.Response:
    async def provide_database_session() -> AsyncGenerator[AsyncSession, None]:
        yield database_session

    async def provide_authenticated_user() -> AuthenticatedUser:
        return TEST_USER

    async def send_request() -> httpx2.Response:
        transport = httpx2.ASGITransport(app=app)
        async with httpx2.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            return await client.request(method, path, json=json)

    app.dependency_overrides[get_database_session] = provide_database_session
    if authenticated:
        app.dependency_overrides[get_authenticated_user] = provide_authenticated_user
    try:
        return asyncio.run(send_request())
    finally:
        app.dependency_overrides.clear()


def create_name_conflict_error() -> IntegrityError:
    original_error = Exception("duplicate category")
    original_error.diag = SimpleNamespace(constraint_name="uq_categories_user_normalized_name")
    return IntegrityError(None, None, original_error)


@pytest.mark.parametrize(
    ("method", "path", "request_body"),
    [
        ("GET", "/api/v1/categories", None),
        ("POST", "/api/v1/categories", {"name": "Work"}),
        ("PATCH", f"/api/v1/categories/{uuid4()}", {"name": "Work"}),
        ("DELETE", f"/api/v1/categories/{uuid4()}", None),
    ],
)
def test_category_endpoints_require_authentication(
    method: str,
    path: str,
    request_body: dict[str, Any] | None,
) -> None:
    response = send_category_request(
        method,
        path,
        database_session=AsyncMock(spec=AsyncSession),
        json=request_body,
        authenticated=False,
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "authentication_required"


def test_get_categories_returns_owned_categories_in_query_order() -> None:
    first_category = Category(id=uuid4(), user_id=TEST_USER_ID, name="Health")
    second_category = Category(id=uuid4(), user_id=TEST_USER_ID, name="Work")
    query_result = MagicMock()
    query_result.scalars.return_value.all.return_value = [first_category, second_category]
    database_session = AsyncMock(spec=AsyncSession)
    database_session.execute.side_effect = [MagicMock(), query_result]

    response = send_category_request("GET", database_session=database_session)

    assert response.status_code == 200
    assert response.json() == [
        {"id": str(first_category.id), "name": "Health"},
        {"id": str(second_category.id), "name": "Work"},
    ]
    query = database_session.execute.await_args_list[1].args[0]
    compiled_query = query.compile(dialect=postgresql.dialect())
    assert TEST_USER_ID in compiled_query.params.values()
    assert "ORDER BY lower(public.categories.name), public.categories.id" in str(compiled_query)


def test_post_category_normalizes_name_and_uses_authenticated_owner() -> None:
    database_session = AsyncMock(spec=AsyncSession)

    response = send_category_request(
        "POST",
        database_session=database_session,
        json={"name": "  Deep Work  "},
    )

    assert response.status_code == 201
    created_category = database_session.add.call_args.args[0]
    assert created_category.user_id == TEST_USER_ID
    assert created_category.name == "Deep Work"
    assert response.json() == {
        "id": str(created_category.id),
        "name": "Deep Work",
    }
    database_session.flush.assert_awaited_once_with()


@pytest.mark.parametrize(
    "request_body",
    [
        {"name": "   "},
        {"name": "x" * 101},
        {"name": "Work", "user_id": str(TEST_USER_ID)},
    ],
)
def test_post_category_rejects_invalid_or_unexpected_fields(
    request_body: dict[str, Any],
) -> None:
    response = send_category_request(
        "POST",
        database_session=AsyncMock(spec=AsyncSession),
        json=request_body,
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_post_category_returns_conflict_for_normalized_duplicate() -> None:
    database_session = AsyncMock(spec=AsyncSession)
    database_session.flush.side_effect = create_name_conflict_error()

    response = send_category_request(
        "POST",
        database_session=database_session,
        json={"name": "work"},
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "category_name_conflict"
    database_session.rollback.assert_awaited_once_with()


def test_patch_category_updates_only_an_owned_category() -> None:
    category_id = uuid4()
    category = Category(id=category_id, user_id=TEST_USER_ID, name="Work")
    query_result = MagicMock()
    query_result.scalar_one_or_none.return_value = category
    database_session = AsyncMock(spec=AsyncSession)
    database_session.execute.side_effect = [MagicMock(), query_result]

    response = send_category_request(
        "PATCH",
        f"/api/v1/categories/{category_id}",
        database_session=database_session,
        json={"name": "  Focused Work "},
    )

    assert response.status_code == 200
    assert response.json() == {"id": str(category_id), "name": "Focused Work"}
    query = database_session.execute.await_args_list[1].args[0]
    compiled_query = query.compile(dialect=postgresql.dialect())
    assert TEST_USER_ID in compiled_query.params.values()
    assert category_id in compiled_query.params.values()
    database_session.flush.assert_awaited_once_with()


@pytest.mark.parametrize("duplicate_name", ["Work", " work "])
def test_patch_category_returns_conflict_for_normalized_duplicate(
    duplicate_name: str,
) -> None:
    category_id = uuid4()
    category = Category(id=category_id, user_id=TEST_USER_ID, name="Personal")
    query_result = MagicMock()
    query_result.scalar_one_or_none.return_value = category
    database_session = AsyncMock(spec=AsyncSession)
    database_session.execute.side_effect = [MagicMock(), query_result]
    database_session.flush.side_effect = create_name_conflict_error()

    response = send_category_request(
        "PATCH",
        f"/api/v1/categories/{category_id}",
        database_session=database_session,
        json={"name": duplicate_name},
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "category_name_conflict"


def test_patch_category_hides_missing_or_foreign_owned_categories() -> None:
    category_id = uuid4()
    query_result = MagicMock()
    query_result.scalar_one_or_none.return_value = None
    database_session = AsyncMock(spec=AsyncSession)
    database_session.execute.side_effect = [MagicMock(), query_result]

    response = send_category_request(
        "PATCH",
        f"/api/v1/categories/{category_id}",
        database_session=database_session,
        json={"name": "Work"},
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "category_not_found"


def test_delete_category_removes_an_unused_owned_category() -> None:
    category_id = uuid4()
    delete_result = MagicMock()
    delete_result.scalar_one_or_none.return_value = category_id
    database_session = AsyncMock(spec=AsyncSession)
    database_session.execute.side_effect = [MagicMock(), delete_result]

    response = send_category_request(
        "DELETE",
        f"/api/v1/categories/{category_id}",
        database_session=database_session,
    )

    assert response.status_code == 204
    delete_statement = database_session.execute.await_args_list[1].args[0]
    compiled_delete = delete_statement.compile(dialect=postgresql.dialect())
    assert TEST_USER_ID in compiled_delete.params.values()
    assert category_id in compiled_delete.params.values()
    assert "NOT (EXISTS" in str(compiled_delete)
    assert "public.tasks" in str(compiled_delete)


def test_delete_category_rejects_a_category_used_by_tasks() -> None:
    category_id = uuid4()
    delete_result = MagicMock()
    delete_result.scalar_one_or_none.return_value = None
    existence_result = MagicMock()
    existence_result.scalar_one.return_value = True
    database_session = AsyncMock(spec=AsyncSession)
    database_session.execute.side_effect = [MagicMock(), delete_result, existence_result]

    response = send_category_request(
        "DELETE",
        f"/api/v1/categories/{category_id}",
        database_session=database_session,
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "category_in_use"


def test_delete_category_hides_missing_or_foreign_owned_categories() -> None:
    category_id = uuid4()
    delete_result = MagicMock()
    delete_result.scalar_one_or_none.return_value = None
    existence_result = MagicMock()
    existence_result.scalar_one.return_value = False
    database_session = AsyncMock(spec=AsyncSession)
    database_session.execute.side_effect = [MagicMock(), delete_result, existence_result]

    response = send_category_request(
        "DELETE",
        f"/api/v1/categories/{category_id}",
        database_session=database_session,
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "category_not_found"
