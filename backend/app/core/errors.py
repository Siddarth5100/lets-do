import logging
from collections.abc import Mapping
from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHttpException

logger = logging.getLogger(__name__)


class ApplicationError(Exception):
    def __init__(
        self,
        *,
        status_code: int,
        code: str,
        message: str,
        details: Any | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details
        self.headers = dict(headers or {})


class DatabaseUnavailableError(ApplicationError):
    def __init__(self) -> None:
        super().__init__(
            status_code=503,
            code="database_unavailable",
            message="The database is currently unavailable.",
        )


class AuthenticationRequiredError(ApplicationError):
    def __init__(self) -> None:
        super().__init__(
            status_code=401,
            code="authentication_required",
            message="Authentication is required.",
            headers={"WWW-Authenticate": "Bearer"},
        )


class InvalidTokenError(ApplicationError):
    def __init__(self) -> None:
        super().__init__(
            status_code=401,
            code="invalid_token",
            message="The access token is invalid.",
            headers={"WWW-Authenticate": "Bearer"},
        )


class TokenExpiredError(ApplicationError):
    def __init__(self) -> None:
        super().__init__(
            status_code=401,
            code="token_expired",
            message="The access token has expired.",
            headers={"WWW-Authenticate": "Bearer"},
        )


class AuthenticationServiceUnavailableError(ApplicationError):
    def __init__(self) -> None:
        super().__init__(
            status_code=503,
            code="authentication_service_unavailable",
            message="Authentication key verification is temporarily unavailable.",
        )


class CategoryNotFoundError(ApplicationError):
    def __init__(self) -> None:
        super().__init__(
            status_code=404,
            code="category_not_found",
            message="The category was not found.",
        )


class CategoryNameConflictError(ApplicationError):
    def __init__(self) -> None:
        super().__init__(
            status_code=409,
            code="category_name_conflict",
            message="A category with this name already exists.",
        )


class CategoryInUseError(ApplicationError):
    def __init__(self) -> None:
        super().__init__(
            status_code=409,
            code="category_in_use",
            message="The category cannot be deleted while tasks use it.",
        )


class TaskNotFoundError(ApplicationError):
    def __init__(self) -> None:
        super().__init__(
            status_code=404,
            code="task_not_found",
            message="The task was not found.",
        )


class TaskSchedulingWarningError(ApplicationError):
    def __init__(self, details: Mapping[str, Any]) -> None:
        super().__init__(
            status_code=409,
            code="task_scheduling_warning",
            message="Review the scheduling warnings before saving.",
            details=details,
        )


class TaskRescheduleUnavailableError(ApplicationError):
    def __init__(self) -> None:
        super().__init__(
            status_code=409,
            code="task_reschedule_unavailable",
            message=(
                "The task can no longer be rescheduled because its one-hour cutoff has passed."
            ),
        )


class TaskTransitionError(ApplicationError):
    def __init__(self) -> None:
        super().__init__(
            status_code=409,
            code="task_transition_invalid",
            message="The requested task status change is not available.",
        )


def create_error_response(
    *,
    status_code: int,
    code: str,
    message: str,
    details: Any | None = None,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    error_body: dict[str, Any] = {"code": code, "message": message}
    if details is not None:
        error_body["details"] = details

    return JSONResponse(
        status_code=status_code,
        content={"error": error_body},
        headers=headers,
    )


async def handle_application_error(
    _request: Request,
    error: ApplicationError,
) -> JSONResponse:
    return create_error_response(
        status_code=error.status_code,
        code=error.code,
        message=error.message,
        details=error.details,
        headers=error.headers,
    )


async def handle_http_error(
    _request: Request,
    error: StarletteHttpException,
) -> JSONResponse:
    if isinstance(error.detail, str):
        message = error.detail
        details = None
    else:
        message = "The request could not be completed."
        details = error.detail

    return create_error_response(
        status_code=error.status_code,
        code="http_error",
        message=message,
        details=details,
    )


async def handle_validation_error(
    _request: Request,
    error: RequestValidationError,
) -> JSONResponse:
    return create_error_response(
        status_code=422,
        code="validation_error",
        message="Request validation failed.",
        details=jsonable_encoder(error.errors()),
    )


async def handle_unexpected_error(_request: Request, error: Exception) -> JSONResponse:
    logger.exception("Unhandled application error", exc_info=error)
    return create_error_response(
        status_code=500,
        code="internal_server_error",
        message="An unexpected error occurred.",
    )


def register_exception_handlers(application: FastAPI) -> None:
    application.add_exception_handler(ApplicationError, handle_application_error)
    application.add_exception_handler(StarletteHttpException, handle_http_error)
    application.add_exception_handler(RequestValidationError, handle_validation_error)
    application.add_exception_handler(Exception, handle_unexpected_error)
