from sqlalchemy import CheckConstraint, ForeignKeyConstraint, UniqueConstraint
from sqlalchemy.dialects.postgresql import TIME

from app.db.base import Base
from app.models import ActivityDay, Category, CompletionEvent, Task, UserSettings

PLANNER_TABLE_NAMES = {
    "activity_days",
    "categories",
    "completion_events",
    "tasks",
    "user_settings",
}


def constraint_by_name(table: object, name: str) -> object:
    return next(constraint for constraint in table.constraints if constraint.name == name)


def test_metadata_contains_only_the_five_planner_models_and_external_auth_users() -> None:
    planner_table_names = {
        table.name
        for table in Base.metadata.tables.values()
        if not table.info.get("external", False)
    }
    planner_tables = [
        table for table in Base.metadata.tables.values() if not table.info.get("external", False)
    ]

    assert planner_table_names == PLANNER_TABLE_NAMES
    assert all(table.schema == "public" for table in planner_tables)
    assert Base.metadata.tables["auth.users"].info["external"] is True
    assert {
        ActivityDay.__tablename__,
        Category.__tablename__,
        CompletionEvent.__tablename__,
        Task.__tablename__,
        UserSettings.__tablename__,
    } == PLANNER_TABLE_NAMES


def test_task_model_preserves_local_schedule_and_fractional_progress() -> None:
    task_table = Task.__table__

    assert task_table.c.schedule_time_zone.type.length == 64
    assert isinstance(task_table.c.start_time.type, TIME)
    assert task_table.c.start_time.type.precision == 0
    assert task_table.c.actual_completed_minutes.type.precision == 12
    assert task_table.c.actual_completed_minutes.type.scale == 2
    assert {index.name for index in task_table.indexes} == {
        "ix_tasks_user_category",
        "ix_tasks_user_schedule",
        "ix_tasks_user_state_date",
    }
    assert Task.__mapper__.version_id_col is task_table.c.version


def test_task_model_enforces_completion_invariants() -> None:
    task_table = Task.__table__
    completed_minutes_constraint = constraint_by_name(
        task_table,
        "ck_tasks_completed_minutes_range",
    )
    state_constraint = constraint_by_name(
        task_table,
        "ck_tasks_completion_state_consistent",
    )

    assert isinstance(completed_minutes_constraint, CheckConstraint)
    assert "actual_completed_minutes <= planned_minutes" in str(
        completed_minutes_constraint.sqltext
    )
    assert isinstance(state_constraint, CheckConstraint)
    assert "actual_completed_minutes = planned_minutes" in str(state_constraint.sqltext)
    assert "completed_at IS NOT NULL" in str(state_constraint.sqltext)


def test_task_category_foreign_key_enforces_same_user_ownership() -> None:
    category_foreign_key = constraint_by_name(
        Task.__table__,
        "fk_tasks_user_category_categories",
    )

    assert isinstance(category_foreign_key, ForeignKeyConstraint)
    assert [column.name for column in category_foreign_key.columns] == [
        "user_id",
        "category_id",
    ]
    assert [element.target_fullname for element in category_foreign_key.elements] == [
        "public.categories.user_id",
        "public.categories.id",
    ]
    assert category_foreign_key.deferrable is True
    assert category_foreign_key.initially == "DEFERRED"


def test_completion_event_foreign_key_enforces_same_user_ownership() -> None:
    task_foreign_key = constraint_by_name(
        CompletionEvent.__table__,
        "fk_completion_events_user_task_tasks",
    )
    unique_task_event = constraint_by_name(
        CompletionEvent.__table__,
        "uq_completion_events_user_task",
    )

    assert isinstance(task_foreign_key, ForeignKeyConstraint)
    assert [element.target_fullname for element in task_foreign_key.elements] == [
        "public.tasks.user_id",
        "public.tasks.id",
    ]
    assert task_foreign_key.ondelete == "CASCADE"
    assert isinstance(unique_task_event, UniqueConstraint)


def test_every_planner_table_references_supabase_auth_user() -> None:
    for table_name in PLANNER_TABLE_NAMES:
        table = Base.metadata.tables[f"public.{table_name}"]
        auth_user_foreign_keys = [
            foreign_key
            for foreign_key in table.foreign_keys
            if foreign_key.target_fullname == "auth.users.id"
        ]

        assert len(auth_user_foreign_keys) == 1
        assert auth_user_foreign_keys[0].ondelete == "CASCADE"
