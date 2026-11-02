"""Opt-in multiuser and RLS verification against the development Supabase project.

The suite is skipped unless RUN_SUPABASE_SECURITY_TESTS=1. It also requires explicit
development-project identity, a local API URL, and two confirmed disposable accounts.
No service-role key is used, and direct mutation probes are always rolled back.
"""

from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

import httpx2
import pytest
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import create_async_engine

from .security_support import (
    AuthenticatedTestUser,
    CreatedResources,
    PlannerApiSession,
    SecurityTestConfiguration,
    authenticate_disposable_user,
    cleanup_created_resources,
    create_test_category,
    create_test_task,
    load_security_test_configuration,
    require_json_list,
    require_json_object,
    require_status,
    unique_marker,
    update_tracked_task,
)

PLANNER_TABLES = {
    "user_settings",
    "categories",
    "tasks",
    "activity_days",
    "completion_events",
}
RUN_LIVE_SECURITY_TESTS = os.environ.get("RUN_SUPABASE_SECURITY_TESTS") == "1"

pytestmark = [
    pytest.mark.supabase_security,
    pytest.mark.skipif(
        not RUN_LIVE_SECURITY_TESTS,
        reason="Set RUN_SUPABASE_SECURITY_TESTS=1 for the development Supabase project.",
    ),
]


@dataclass
class SecurityScenario:
    marker: str
    user_a: AuthenticatedTestUser
    user_b: AuthenticatedTestUser
    api_a: PlannerApiSession
    api_b: PlannerApiSession
    resources_a: CreatedResources
    resources_b: CreatedResources
    category_a: dict[str, Any]
    category_b: dict[str, Any]
    task_a: dict[str, Any]
    task_b: dict[str, Any]


@pytest.fixture(scope="module")
def security_configuration() -> SecurityTestConfiguration:
    return load_security_test_configuration()


@pytest.fixture(scope="module")
def disposable_users(
    security_configuration: SecurityTestConfiguration,
) -> tuple[AuthenticatedTestUser, AuthenticatedTestUser]:
    user_a = authenticate_disposable_user(
        security_configuration,
        label="A",
        email=security_configuration.user_a_email,
        password=security_configuration.user_a_password,
    )
    user_b = authenticate_disposable_user(
        security_configuration,
        label="B",
        email=security_configuration.user_b_email,
        password=security_configuration.user_b_password,
    )
    if user_a.user_id == user_b.user_id:
        pytest.fail(
            "The disposable security-test accounts resolved to the same user.",
            pytrace=False,
        )

    for user in (user_a, user_b):
        api_session = PlannerApiSession(security_configuration.api_url, user)
        identity = require_json_object(
            require_status(
                api_session.request("GET", "/api/v1/auth/me"),
                200,
                f"Authenticate disposable user {user.label}",
            ),
            f"Authenticate disposable user {user.label}",
        )
        if identity.get("user_id") != user.user_id:
            pytest.fail(
                f"The local API returned the wrong identity for disposable user {user.label}.",
                pytrace=False,
            )
    return user_a, user_b


@pytest.fixture(scope="module")
def security_scenario(
    security_configuration: SecurityTestConfiguration,
    disposable_users: tuple[AuthenticatedTestUser, AuthenticatedTestUser],
) -> SecurityScenario:
    user_a, user_b = disposable_users
    api_a = PlannerApiSession(security_configuration.api_url, user_a)
    api_b = PlannerApiSession(security_configuration.api_url, user_b)
    resources_a = CreatedResources()
    resources_b = CreatedResources()
    marker = unique_marker()
    resources_a.original_settings = require_json_object(
        require_status(api_a.request("GET", "/api/v1/settings"), 200, "Read A settings"),
        "Read A settings",
    )
    resources_b.original_settings = require_json_object(
        require_status(api_b.request("GET", "/api/v1/settings"), 200, "Read B settings"),
        "Read B settings",
    )
    category_a = create_test_category(api_a, resources_a, f"{marker}-A")
    category_b = create_test_category(api_b, resources_b, f"{marker}-B")
    task_a = create_test_task(
        api_a,
        resources_a,
        category_id=str(category_a["id"]),
        title=f"{marker}-task-A",
    )
    task_b = create_test_task(
        api_b,
        resources_b,
        category_id=str(category_b["id"]),
        title=f"{marker}-task-B",
    )
    scenario = SecurityScenario(
        marker=marker,
        user_a=user_a,
        user_b=user_b,
        api_a=api_a,
        api_b=api_b,
        resources_a=resources_a,
        resources_b=resources_b,
        category_a=category_a,
        category_b=category_b,
        task_a=task_a,
        task_b=task_b,
    )
    try:
        yield scenario
    finally:
        cleanup_created_resources(api_a, resources_a)
        cleanup_created_resources(api_b, resources_b)


def test_live_runtime_role_grants_ownership_and_rls_policies(
    security_configuration: SecurityTestConfiguration,
) -> None:
    async def audit_database() -> None:
        engine = create_async_engine(security_configuration.database_url, pool_pre_ping=True)
        try:
            async with engine.connect() as connection:
                role = (
                    (
                        await connection.execute(
                            text(
                                "SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, "
                                "rolreplication, rolbypassrls FROM pg_roles "
                                "WHERE rolname = current_user"
                            )
                        )
                    )
                    .mappings()
                    .one_or_none()
                )
                assert role is not None
                assert role["rolname"] == security_configuration.runtime_role
                assert role["rolsuper"] is False
                assert role["rolinherit"] is False
                assert role["rolcreaterole"] is False
                assert role["rolcreatedb"] is False
                assert role["rolreplication"] is False
                assert role["rolbypassrls"] is False

                schema_privileges = (
                    (
                        await connection.execute(
                            text(
                                "SELECT has_schema_privilege(current_user, 'public', 'USAGE') "
                                "AS usage, "
                                "has_schema_privilege(current_user, 'public', 'CREATE') AS create"
                            )
                        )
                    )
                    .mappings()
                    .one()
                )
                assert schema_privileges["usage"] is True
                assert schema_privileges["create"] is False

                table_rows = (
                    (
                        await connection.execute(
                            text(
                                "SELECT c.relname, pg_get_userbyid(c.relowner) AS owner, "
                                "c.relrowsecurity, c.relforcerowsecurity, "
                                "pg_has_role(current_user, c.relowner, 'MEMBER') "
                                "AS owns_or_inherits, "
                                "has_table_privilege(current_user, c.oid, "
                                "'SELECT,INSERT,UPDATE,DELETE') AS runtime_crud, "
                                "has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') "
                                "AS anon_crud, "
                                "has_table_privilege('authenticated', c.oid, "
                                "'SELECT,INSERT,UPDATE,DELETE') AS authenticated_crud "
                                "FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
                                "WHERE n.nspname = 'public' AND c.relname = ANY(:table_names)"
                            ),
                            {"table_names": sorted(PLANNER_TABLES)},
                        )
                    )
                    .mappings()
                    .all()
                )
                assert {row["relname"] for row in table_rows} == PLANNER_TABLES
                for row in table_rows:
                    assert row["owner"] != security_configuration.runtime_role
                    assert row["owns_or_inherits"] is False
                    assert row["relrowsecurity"] is True
                    assert row["runtime_crud"] is True
                    assert row["anon_crud"] is False
                    assert row["authenticated_crud"] is False

                policies = (
                    (
                        await connection.execute(
                            text(
                                "SELECT tablename, cmd, roles, qual, with_check FROM pg_policies "
                                "WHERE schemaname = 'public' AND tablename = ANY(:table_names)"
                            ),
                            {"table_names": sorted(PLANNER_TABLES)},
                        )
                    )
                    .mappings()
                    .all()
                )
                assert {row["tablename"] for row in policies} == PLANNER_TABLES
                assert len(policies) == len(PLANNER_TABLES)
                for policy in policies:
                    assert policy["cmd"] == "ALL"
                    assert security_configuration.runtime_role in policy["roles"]
                    assert "app.current_user_id" in policy["qual"]
                    assert "app.current_user_id" in policy["with_check"]
                    assert "user_id" in policy["qual"]
                    assert "user_id" in policy["with_check"]
        finally:
            await engine.dispose()

    _run_database_verification(audit_database())


def test_transaction_local_identity_and_pool_isolation(
    security_configuration: SecurityTestConfiguration,
    security_scenario: SecurityScenario,
) -> None:
    async def verify_pool_isolation() -> None:
        engine = create_async_engine(
            security_configuration.database_url,
            pool_pre_ping=True,
            pool_size=1,
            max_overflow=0,
        )
        try:
            async with engine.begin() as connection:
                await _set_current_user(connection, security_scenario.user_a.user_id)
                visible_a = await connection.scalar(
                    text("SELECT count(*) FROM public.tasks WHERE id = :task_id"),
                    {"task_id": security_scenario.task_a["id"]},
                )
                hidden_b = await connection.scalar(
                    text("SELECT count(*) FROM public.tasks WHERE id = :task_id"),
                    {"task_id": security_scenario.task_b["id"]},
                )
                assert visible_a == 1
                assert hidden_b == 0

            async with engine.connect() as connection:
                current_identity = await connection.scalar(
                    text("SELECT current_setting('app.current_user_id', true)")
                )
                assert current_identity in (None, "")
                for table_name in PLANNER_TABLES:
                    visible_rows = await connection.scalar(
                        text(f"SELECT count(*) FROM public.{table_name}")
                    )
                    assert visible_rows == 0
                await connection.rollback()

            async with engine.begin() as connection:
                await _set_current_user(connection, security_scenario.user_b.user_id)
                visible_b = await connection.scalar(
                    text("SELECT count(*) FROM public.tasks WHERE id = :task_id"),
                    {"task_id": security_scenario.task_b["id"]},
                )
                hidden_a = await connection.scalar(
                    text("SELECT count(*) FROM public.tasks WHERE id = :task_id"),
                    {"task_id": security_scenario.task_a["id"]},
                )
                assert visible_b == 1
                assert hidden_a == 0
        finally:
            await engine.dispose()

    _run_database_verification(verify_pool_isolation())


def test_direct_cross_user_mutations_are_denied_and_rolled_back(
    security_configuration: SecurityTestConfiguration,
    security_scenario: SecurityScenario,
) -> None:
    async def verify_mutation_isolation() -> None:
        engine = create_async_engine(security_configuration.database_url, pool_pre_ping=True)
        try:
            async with engine.connect() as connection:
                transaction = await connection.begin()
                try:
                    await _set_current_user(connection, security_scenario.user_a.user_id)
                    savepoint = await connection.begin_nested()
                    with pytest.raises(SQLAlchemyError):
                        await connection.execute(
                            text(
                                "INSERT INTO public.categories (id, user_id, name) "
                                "VALUES (:id, :user_id, :name)"
                            ),
                            {
                                "id": uuid4(),
                                "user_id": security_scenario.user_b.user_id,
                                "name": f"{security_scenario.marker}-forged",
                            },
                        )
                    if savepoint.is_active:
                        await savepoint.rollback()

                    update_result = await connection.execute(
                        text("UPDATE public.categories SET name = :name WHERE id = :category_id"),
                        {
                            "name": f"{security_scenario.marker}-changed",
                            "category_id": security_scenario.category_b["id"],
                        },
                    )
                    delete_result = await connection.execute(
                        text("DELETE FROM public.tasks WHERE id = :task_id"),
                        {"task_id": security_scenario.task_b["id"]},
                    )
                    assert update_result.rowcount == 0
                    assert delete_result.rowcount == 0
                finally:
                    await transaction.rollback()
        finally:
            await engine.dispose()

    _run_database_verification(verify_mutation_isolation())


def test_real_api_enforces_cross_user_isolation(security_scenario: SecurityScenario) -> None:
    scenario = security_scenario
    task_a_id = str(scenario.task_a["id"])
    task_b_id = str(scenario.task_b["id"])
    category_b_id = str(scenario.category_b["id"])
    task_b_version = int(scenario.task_b["version"])

    tasks_visible_to_a = require_json_list(
        require_status(scenario.api_a.request("GET", "/api/v1/tasks"), 200, "List A tasks"),
        "List A tasks",
    )
    tasks_visible_to_b = require_json_list(
        require_status(scenario.api_b.request("GET", "/api/v1/tasks"), 200, "List B tasks"),
        "List B tasks",
    )
    assert task_b_id not in {str(task["id"]) for task in tasks_visible_to_a}
    assert task_a_id not in {str(task["id"]) for task in tasks_visible_to_b}

    cross_user_requests = [
        scenario.api_a.request("GET", f"/api/v1/tasks/{task_b_id}"),
        scenario.api_a.request(
            "PATCH",
            f"/api/v1/tasks/{task_b_id}",
            json={"version": task_b_version, "important": True},
        ),
        scenario.api_a.request(
            "PATCH",
            f"/api/v1/tasks/{task_b_id}/completion",
            json={"version": task_b_version, "action": "complete"},
        ),
        scenario.api_a.request("DELETE", f"/api/v1/tasks/{task_b_id}?version={task_b_version}"),
        scenario.api_a.request(
            "PATCH",
            f"/api/v1/tasks/{task_a_id}",
            json={
                "version": scenario.task_a["version"],
                "category_id": category_b_id,
                "confirm_warnings": True,
            },
        ),
        scenario.api_a.request(
            "PATCH",
            f"/api/v1/categories/{category_b_id}",
            json={"name": f"{scenario.marker}-unauthorized"},
        ),
        scenario.api_a.request("DELETE", f"/api/v1/categories/{category_b_id}"),
    ]
    assert [response.status_code for response in cross_user_requests] == [
        404,
        404,
        404,
        404,
        404,
        404,
        404,
    ]
    require_status(
        scenario.api_b.request("GET", f"/api/v1/tasks/{task_b_id}"),
        200,
        "Verify B task after cross-user attempts",
    )

    create_with_foreign_category = scenario.api_a.request(
        "POST",
        "/api/v1/tasks",
        json={
            "category_id": category_b_id,
            "title": f"{scenario.marker}-foreign-category",
            "scheduled_date": datetime.now(UTC).date().isoformat(),
            "start_time": "10:00",
            "schedule_time_zone": "Asia/Kolkata",
            "planned_minutes": 30,
            "reminder_enabled": False,
            "reminder_minutes_before": 10,
            "important": False,
            "confirm_warnings": True,
        },
    )
    assert create_with_foreign_category.status_code == 404

    settings_a = {
        "manual_theme_id": "monday",
        "sidebar_collapsed": True,
        "time_zone": "Asia/Kolkata",
    }
    settings_b = {
        "manual_theme_id": "friday",
        "sidebar_collapsed": False,
        "time_zone": "Asia/Kolkata",
    }
    require_status(
        scenario.api_a.request("PUT", "/api/v1/settings", json=settings_a),
        200,
        "Update A settings",
    )
    require_status(
        scenario.api_b.request("PUT", "/api/v1/settings", json=settings_b),
        200,
        "Update B settings",
    )
    assert (
        require_json_object(
            scenario.api_a.request("GET", "/api/v1/settings"), "Read isolated A settings"
        )
        == settings_a
    )
    assert (
        require_json_object(
            scenario.api_b.request("GET", "/api/v1/settings"), "Read isolated B settings"
        )
        == settings_b
    )

    completed_a = require_json_object(
        require_status(
            scenario.api_a.request(
                "PATCH",
                f"/api/v1/tasks/{task_a_id}/completion",
                json={"version": scenario.task_a["version"], "action": "complete"},
            ),
            200,
            "Complete A task",
        ),
        "Complete A task",
    )
    completed_b = require_json_object(
        require_status(
            scenario.api_b.request(
                "PATCH",
                f"/api/v1/tasks/{task_b_id}/completion",
                json={"version": scenario.task_b["version"], "action": "complete"},
            ),
            200,
            "Complete B task",
        ),
        "Complete B task",
    )
    update_tracked_task(scenario.resources_a, completed_a)
    update_tracked_task(scenario.resources_b, completed_b)
    scenario.task_a = completed_a
    scenario.task_b = completed_b

    activity_a = require_json_object(
        require_status(scenario.api_a.request("GET", "/api/v1/activity"), 200, "Read A activity"),
        "Read A activity",
    )
    activity_b = require_json_object(
        require_status(scenario.api_b.request("GET", "/api/v1/activity"), 200, "Read B activity"),
        "Read B activity",
    )
    event_task_ids_a = {event["task_id"] for event in activity_a["completion_events"]}
    event_task_ids_b = {event["task_id"] for event in activity_b["completion_events"]}
    assert task_a_id in event_task_ids_a
    assert task_b_id not in event_task_ids_a
    assert task_b_id in event_task_ids_b
    assert task_a_id not in event_task_ids_b


def test_import_and_unauthorized_requests_remain_user_isolated(
    security_configuration: SecurityTestConfiguration,
    security_scenario: SecurityScenario,
) -> None:
    scenario = security_scenario
    import_title = f"{scenario.marker}-imported"
    import_category = f"{scenario.marker}-import"
    serialized_state = json.dumps(
        {
            "version": 2,
            "tasks": [
                {
                    "id": "shared-source-id",
                    "title": import_title,
                    "category": import_category,
                    "date": datetime.now(UTC).date().isoformat(),
                    "startTime": "11:00",
                    "plannedMinutes": 30,
                    "reminder": {"enabled": False, "minutesBefore": 10},
                    "actualCompletedMinutes": 0,
                    "completionState": "pending",
                    "important": False,
                    "createdAt": "2026-01-01T00:00:00Z",
                    "updatedAt": "2026-01-01T00:00:00Z",
                    "completedAt": None,
                }
            ],
            "activityDates": [],
            "completionEvents": [],
            "customCategories": [import_category],
            "settings": {"manualThemeId": None, "sidebarCollapsed": False},
        },
        separators=(",", ":"),
    )
    preview_a = require_json_object(
        require_status(
            scenario.api_a.request(
                "POST",
                "/api/v1/imports/local-storage/preview",
                json={"serialized_state": serialized_state, "include_settings": False},
            ),
            200,
            "Preview A import",
        ),
        "Preview A import",
    )
    require_status(
        scenario.api_a.request(
            "POST",
            "/api/v1/imports/local-storage",
            json={
                "serialized_state": serialized_state,
                "include_settings": False,
                "preview_digest": preview_a["preview_digest"],
            },
        ),
        200,
        "Commit A import",
    )
    preview_b = require_json_object(
        require_status(
            scenario.api_b.request(
                "POST",
                "/api/v1/imports/local-storage/preview",
                json={"serialized_state": serialized_state, "include_settings": False},
            ),
            200,
            "Preview B import",
        ),
        "Preview B import",
    )
    assert preview_b["tasks"]["existing"] == 0
    assert preview_b["categories"]["existing"] == 0

    tasks_a = require_json_list(scenario.api_a.request("GET", "/api/v1/tasks"), "List A tasks")
    tasks_b = require_json_list(scenario.api_b.request("GET", "/api/v1/tasks"), "List B tasks")
    imported_tasks = [task for task in tasks_a if task["title"] == import_title]
    assert len(imported_tasks) == 1
    assert all(task["title"] != import_title for task in tasks_b)
    imported_task = imported_tasks[0]
    scenario.resources_a.tasks[str(imported_task["id"])] = int(imported_task["version"])
    categories_a = require_json_list(
        scenario.api_a.request("GET", "/api/v1/categories"), "List A categories"
    )
    imported_categories = [
        category for category in categories_a if category["name"] == import_category
    ]
    assert len(imported_categories) == 1
    scenario.resources_a.category_ids.append(str(imported_categories[0]["id"]))

    anonymous_api = PlannerApiSession(security_configuration.api_url)
    unauthorized_requests = [
        anonymous_api.request("GET", "/api/v1/tasks"),
        anonymous_api.request("GET", "/api/v1/categories"),
        anonymous_api.request("GET", "/api/v1/settings"),
        anonymous_api.request("GET", "/api/v1/activity"),
        anonymous_api.request(
            "POST",
            "/api/v1/imports/local-storage/preview",
            json={"serialized_state": serialized_state, "include_settings": False},
        ),
    ]
    assert all(response.status_code == 401 for response in unauthorized_requests)

    invalid_token_response = httpx2.get(
        f"{security_configuration.api_url}/api/v1/tasks",
        headers={"Authorization": "Bearer invalid-test-token"},
        timeout=15,
    )
    assert invalid_token_response.status_code == 401


async def _set_current_user(connection: Any, user_id: str) -> None:
    UUID(user_id)
    await connection.execute(
        text("SELECT set_config('app.current_user_id', :user_id, true)"),
        {"user_id": user_id},
    )


def _run_database_verification(coroutine: Any) -> None:
    try:
        asyncio.run(coroutine)
    except AssertionError:
        raise
    except SQLAlchemyError:
        pytest.fail("The development runtime database verification failed.", pytrace=False)
