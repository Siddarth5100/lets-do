from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, StrictBool
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_authenticated_database_session, get_authenticated_user
from app.core.errors import ApplicationError
from app.core.security import AuthenticatedUser
from app.services.legacy_import import (
    EntityImportSummary,
    ImportIssue,
    LegacyImportResult,
    commit_legacy_import,
    create_import_digest,
    preview_legacy_import,
)

router = APIRouter(prefix="/api/v1/imports/local-storage", tags=["imports"])


class LocalStorageImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    serialized_state: str = Field(min_length=1, max_length=1_000_000)
    include_settings: StrictBool = False


class LocalStorageImportCommitRequest(LocalStorageImportRequest):
    preview_digest: str = Field(pattern=r"^[a-f0-9]{64}$")


class ImportIssueResponse(BaseModel):
    entity: str
    source_id: str | None
    reason: str


class EntityImportSummaryResponse(BaseModel):
    valid: int
    invalid: int
    created: int
    existing: int


class LocalStorageImportResponse(BaseModel):
    source_version: int | None
    preview_digest: str
    tasks: EntityImportSummaryResponse
    categories: EntityImportSummaryResponse
    activity_dates: EntityImportSummaryResponse
    completion_events: EntityImportSummaryResponse
    settings_status: str
    issues: list[ImportIssueResponse]
    warnings: list[str]


def _summary_response(summary: EntityImportSummary) -> EntityImportSummaryResponse:
    return EntityImportSummaryResponse(
        valid=summary.valid,
        invalid=summary.invalid,
        created=summary.created,
        existing=summary.existing,
    )


def _issue_response(issue: ImportIssue) -> ImportIssueResponse:
    return ImportIssueResponse(
        entity=issue.entity,
        source_id=issue.source_id,
        reason=issue.reason,
    )


def _import_response(result: LegacyImportResult) -> LocalStorageImportResponse:
    return LocalStorageImportResponse(
        source_version=result.source_version,
        preview_digest=result.digest,
        tasks=_summary_response(result.tasks),
        categories=_summary_response(result.categories),
        activity_dates=_summary_response(result.activity_dates),
        completion_events=_summary_response(result.completion_events),
        settings_status=result.settings_status,
        issues=[_issue_response(issue) for issue in result.issues],
        warnings=result.warnings,
    )


@router.post("/preview", response_model=LocalStorageImportResponse)
async def preview_local_storage_import(
    import_request: LocalStorageImportRequest,
    authenticated_user: Annotated[AuthenticatedUser, Depends(get_authenticated_user)],
    database_session: Annotated[
        AsyncSession,
        Depends(get_authenticated_database_session),
    ],
) -> LocalStorageImportResponse:
    result = await preview_legacy_import(
        database_session,
        authenticated_user.user_id,
        import_request.serialized_state,
        import_request.include_settings,
    )
    return _import_response(result)


@router.post("", response_model=LocalStorageImportResponse)
async def import_local_storage_data(
    import_request: LocalStorageImportCommitRequest,
    authenticated_user: Annotated[AuthenticatedUser, Depends(get_authenticated_user)],
    database_session: Annotated[
        AsyncSession,
        Depends(get_authenticated_database_session),
    ],
) -> LocalStorageImportResponse:
    expected_digest = create_import_digest(
        import_request.serialized_state,
        import_request.include_settings,
    )
    if expected_digest != import_request.preview_digest:
        raise ApplicationError(
            status_code=409,
            code="import_preview_mismatch",
            message="The browser data or import options changed after preview. Preview it again.",
        )
    result = await commit_legacy_import(
        database_session,
        authenticated_user.user_id,
        import_request.serialized_state,
        import_request.include_settings,
    )
    return _import_response(result)
