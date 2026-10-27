import asyncio
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_authenticated_database_session
from app.core.security import AuthenticatedUser


def create_authenticated_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        user_id=uuid4(),
        role="authenticated",
        email="planner@example.com",
    )


def test_authenticated_database_session_sets_local_user_and_commits() -> None:
    async def exercise_dependency() -> None:
        authenticated_user = create_authenticated_user()
        database_session = AsyncMock(spec=AsyncSession)
        session_dependency = get_authenticated_database_session(
            authenticated_user,
            database_session,
        )

        yielded_session = await anext(session_dependency)

        assert yielded_session is database_session
        statement, parameters = database_session.execute.await_args.args
        assert str(statement) == "SELECT set_config('app.current_user_id', :user_id, true)"
        assert parameters == {"user_id": str(authenticated_user.user_id)}
        database_session.commit.assert_not_awaited()

        with pytest.raises(StopAsyncIteration):
            await anext(session_dependency)

        database_session.commit.assert_awaited_once_with()
        database_session.rollback.assert_not_awaited()

    asyncio.run(exercise_dependency())


def test_authenticated_database_session_rolls_back_request_errors() -> None:
    class RequestFailureError(Exception):
        pass

    async def exercise_dependency() -> None:
        database_session = AsyncMock(spec=AsyncSession)
        session_dependency = get_authenticated_database_session(
            create_authenticated_user(),
            database_session,
        )
        await anext(session_dependency)

        with pytest.raises(RequestFailureError):
            await session_dependency.athrow(RequestFailureError("request failed"))

        database_session.rollback.assert_awaited_once_with()
        database_session.commit.assert_not_awaited()

    asyncio.run(exercise_dependency())


def test_authenticated_database_session_rolls_back_identity_setup_errors() -> None:
    class IdentitySetupError(Exception):
        pass

    async def exercise_dependency() -> None:
        database_session = AsyncMock(spec=AsyncSession)
        database_session.execute.side_effect = IdentitySetupError("database unavailable")
        session_dependency = get_authenticated_database_session(
            create_authenticated_user(),
            database_session,
        )

        with pytest.raises(IdentitySetupError):
            await anext(session_dependency)

        database_session.rollback.assert_awaited_once_with()
        database_session.commit.assert_not_awaited()

    asyncio.run(exercise_dependency())
