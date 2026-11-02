"""Secret-safe helpers for the opt-in Supabase security integration suite."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlparse
from uuid import uuid4

import httpx2
import pytest
from sqlalchemy.engine import make_url

PROJECT_REFERENCE_PATTERN = re.compile(r"^[a-z0-9]{20}$")
LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}


@dataclass(frozen=True, repr=False)
class SecurityTestConfiguration:
    project_reference: str
    supabase_url: str
    api_url: str
    database_url: str = field(repr=False)
    publishable_key: str = field(repr=False)
    user_a_email: str = field(repr=False)
    user_a_password: str = field(repr=False)
    user_b_email: str = field(repr=False)
    user_b_password: str = field(repr=False)
    runtime_role: str = "lets_do_api"


@dataclass(frozen=True, repr=False)
class AuthenticatedTestUser:
    label: str
    user_id: str
    email: str = field(repr=False)
    access_token: str = field(repr=False)


@dataclass
class CreatedResources:
    category_ids: list[str] = field(default_factory=list)
    tasks: dict[str, int] = field(default_factory=dict)
    original_settings: dict[str, Any] | None = None


class PlannerApiSession:
    def __init__(
        self,
        api_url: str,
        authenticated_user: AuthenticatedTestUser | None = None,
    ) -> None:
        self.api_url = api_url.rstrip("/")
        self.authenticated_user = authenticated_user

    def request(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
    ) -> httpx2.Response:
        headers = {}
        if self.authenticated_user is not None:
            headers["Authorization"] = f"Bearer {self.authenticated_user.access_token}"
        try:
            return httpx2.request(
                method,
                f"{self.api_url}{path}",
                headers=headers,
                json=json,
                timeout=15,
            )
        except httpx2.HTTPError:
            pytest.fail("The local development API could not be reached.", pytrace=False)


def load_security_test_configuration() -> SecurityTestConfiguration:
    required_values = {
        name: os.environ.get(name, "").strip()
        for name in (
            "SECURITY_TEST_EXPECTED_PROJECT_REF",
            "SECURITY_TEST_SUPABASE_URL",
            "SECURITY_TEST_SUPABASE_PUBLISHABLE_KEY",
            "SECURITY_TEST_DATABASE_URL",
            "SECURITY_TEST_API_URL",
            "SECURITY_TEST_USER_A_EMAIL",
            "SECURITY_TEST_USER_A_PASSWORD",
            "SECURITY_TEST_USER_B_EMAIL",
            "SECURITY_TEST_USER_B_PASSWORD",
        )
    }
    missing_names = [name for name, value in required_values.items() if not value]
    if missing_names:
        pytest.fail(
            "Security integration configuration is incomplete; missing: "
            + ", ".join(sorted(missing_names)),
            pytrace=False,
        )
    if os.environ.get("SECURITY_TEST_ENVIRONMENT") != "development":
        pytest.fail("SECURITY_TEST_ENVIRONMENT must be exactly 'development'.", pytrace=False)
    if os.environ.get("SECURITY_TEST_CONFIRM_DISPOSABLE_USERS") != "1":
        pytest.fail(
            "SECURITY_TEST_CONFIRM_DISPOSABLE_USERS=1 is required to confirm isolated users.",
            pytrace=False,
        )

    project_reference = required_values["SECURITY_TEST_EXPECTED_PROJECT_REF"]
    if not PROJECT_REFERENCE_PATTERN.fullmatch(project_reference):
        pytest.fail("The expected Supabase project reference is invalid.", pytrace=False)

    supabase_url = required_values["SECURITY_TEST_SUPABASE_URL"].rstrip("/")
    supabase_host = (urlparse(supabase_url).hostname or "").lower()
    if supabase_host != f"{project_reference}.supabase.co":
        pytest.fail(
            "The Supabase URL does not match the expected development project.",
            pytrace=False,
        )

    database_url = required_values["SECURITY_TEST_DATABASE_URL"]
    try:
        parsed_database_url = make_url(database_url)
    except Exception:
        pytest.fail("The security-test database URL is invalid.", pytrace=False)
    database_host = (parsed_database_url.host or "").lower()
    database_user = parsed_database_url.username or ""
    direct_host_matches = database_host == f"db.{project_reference}.supabase.co"
    pooler_user_matches = database_user.endswith(f".{project_reference}")
    if not direct_host_matches and not pooler_user_matches:
        pytest.fail(
            "The database URL does not match the expected development project.",
            pytrace=False,
        )

    api_url = required_values["SECURITY_TEST_API_URL"].rstrip("/")
    api_host = (urlparse(api_url).hostname or "").lower()
    if api_host not in LOOPBACK_HOSTS:
        pytest.fail("SECURITY_TEST_API_URL must target a local API process.", pytrace=False)

    user_a_email = required_values["SECURITY_TEST_USER_A_EMAIL"]
    user_b_email = required_values["SECURITY_TEST_USER_B_EMAIL"]
    if user_a_email.casefold() == user_b_email.casefold():
        pytest.fail("The two disposable security-test users must be distinct.", pytrace=False)

    return SecurityTestConfiguration(
        project_reference=project_reference,
        supabase_url=supabase_url,
        api_url=api_url,
        database_url=database_url,
        publishable_key=required_values["SECURITY_TEST_SUPABASE_PUBLISHABLE_KEY"],
        user_a_email=user_a_email,
        user_a_password=required_values["SECURITY_TEST_USER_A_PASSWORD"],
        user_b_email=user_b_email,
        user_b_password=required_values["SECURITY_TEST_USER_B_PASSWORD"],
        runtime_role=os.environ.get("SECURITY_TEST_RUNTIME_ROLE", "lets_do_api").strip(),
    )


def authenticate_disposable_user(
    configuration: SecurityTestConfiguration,
    *,
    label: str,
    email: str,
    password: str,
) -> AuthenticatedTestUser:
    try:
        response = httpx2.post(
            f"{configuration.supabase_url}/auth/v1/token?grant_type=password",
            headers={"apikey": configuration.publishable_key},
            json={"email": email, "password": password},
            timeout=15,
        )
    except httpx2.HTTPError:
        pytest.fail(f"Supabase authentication failed for disposable user {label}.", pytrace=False)
    if response.status_code != 200:
        pytest.fail(
            f"Supabase authentication failed for disposable user {label} "
            f"(HTTP {response.status_code}).",
            pytrace=False,
        )
    try:
        response_body = response.json()
        access_token = response_body["access_token"]
        user_id = response_body["user"]["id"]
    except (KeyError, TypeError, ValueError):
        pytest.fail(
            f"Supabase returned an invalid login response for disposable user {label}.",
            pytrace=False,
        )
    if not isinstance(access_token, str) or not isinstance(user_id, str):
        pytest.fail(
            f"Supabase returned an invalid login response for disposable user {label}.",
            pytrace=False,
        )
    return AuthenticatedTestUser(label, user_id, email, access_token)


def require_status(
    response: httpx2.Response,
    expected_status: int,
    operation: str,
) -> httpx2.Response:
    if response.status_code != expected_status:
        pytest.fail(
            f"{operation} returned HTTP {response.status_code}; expected {expected_status}.",
            pytrace=False,
        )
    return response


def require_json_object(response: httpx2.Response, operation: str) -> dict[str, Any]:
    try:
        response_body = response.json()
    except ValueError:
        pytest.fail(f"{operation} returned a non-JSON response.", pytrace=False)
    if not isinstance(response_body, dict):
        pytest.fail(f"{operation} returned an unexpected response shape.", pytrace=False)
    return response_body


def require_json_list(response: httpx2.Response, operation: str) -> list[dict[str, Any]]:
    try:
        response_body = response.json()
    except ValueError:
        pytest.fail(f"{operation} returned a non-JSON response.", pytrace=False)
    if not isinstance(response_body, list) or not all(
        isinstance(item, dict) for item in response_body
    ):
        pytest.fail(f"{operation} returned an unexpected response shape.", pytrace=False)
    return response_body


def create_test_category(
    api_session: PlannerApiSession,
    resources: CreatedResources,
    name: str,
) -> dict[str, Any]:
    response = require_status(
        api_session.request("POST", "/api/v1/categories", json={"name": name}),
        201,
        "Create category",
    )
    category = require_json_object(response, "Create category")
    resources.category_ids.append(str(category["id"]))
    return category


def create_test_task(
    api_session: PlannerApiSession,
    resources: CreatedResources,
    *,
    category_id: str,
    title: str,
) -> dict[str, Any]:
    response = require_status(
        api_session.request(
            "POST",
            "/api/v1/tasks",
            json={
                "category_id": category_id,
                "title": title,
                "scheduled_date": datetime.now(UTC).date().isoformat(),
                "start_time": "09:00",
                "schedule_time_zone": "Asia/Kolkata",
                "planned_minutes": 30,
                "reminder_enabled": False,
                "reminder_minutes_before": 10,
                "important": False,
                "confirm_warnings": True,
            },
        ),
        201,
        "Create task",
    )
    task = require_json_object(response, "Create task")
    resources.tasks[str(task["id"])] = int(task["version"])
    return task


def update_tracked_task(resources: CreatedResources, task: dict[str, Any]) -> None:
    resources.tasks[str(task["id"])] = int(task["version"])


def cleanup_created_resources(
    api_session: PlannerApiSession,
    resources: CreatedResources,
) -> None:
    for task_id, version in reversed(list(resources.tasks.items())):
        response = api_session.request("DELETE", f"/api/v1/tasks/{task_id}?version={version}")
        if response.status_code not in (204, 404):
            pytest.fail("Security-test task cleanup failed.", pytrace=False)
    for category_id in reversed(resources.category_ids):
        response = api_session.request("DELETE", f"/api/v1/categories/{category_id}")
        if response.status_code not in (204, 404):
            pytest.fail("Security-test category cleanup failed.", pytrace=False)
    if resources.original_settings is not None:
        response = api_session.request(
            "PUT",
            "/api/v1/settings",
            json=resources.original_settings,
        )
        if response.status_code != 200:
            pytest.fail("Security-test settings cleanup failed.", pytrace=False)


def unique_marker() -> str:
    return f"security-{uuid4().hex[:12]}"
