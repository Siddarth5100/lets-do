"""Create the initial planner tables with per-user isolation.

Revision ID: 20261026_01
Revises:
Create Date: 2026-10-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20261026_01"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

RUNTIME_DATABASE_ROLE = "lets_do_api"
PLANNER_TABLE_NAMES = (
    "user_settings",
    "categories",
    "tasks",
    "activity_days",
    "completion_events",
)
CURRENT_USER_SETTING = "NULLIF(current_setting('app.current_user_id', true), '')::uuid"


def upgrade() -> None:
    op.create_table(
        "user_settings",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "daily_capacity_minutes",
            sa.SmallInteger(),
            server_default=sa.text("480"),
            nullable=False,
        ),
        sa.Column("manual_theme_id", sa.String(length=16), nullable=True),
        sa.Column(
            "sidebar_collapsed",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column(
            "time_zone",
            sa.String(length=64),
            server_default=sa.text("'UTC'"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "daily_capacity_minutes BETWEEN 1 AND 1440",
            name="ck_user_settings_daily_capacity_minutes_range",
        ),
        sa.CheckConstraint(
            "manual_theme_id IS NULL OR manual_theme_id IN "
            "('sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday')",
            name="ck_user_settings_manual_theme_id_valid",
        ),
        sa.CheckConstraint(
            "btrim(time_zone) <> ''",
            name="ck_user_settings_time_zone_not_blank",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["auth.users.id"],
            name="fk_user_settings_user_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_id", name="pk_user_settings"),
        schema="public",
    )

    op.create_table(
        "categories",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("btrim(name) <> ''", name="ck_categories_name_not_blank"),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["auth.users.id"],
            name="fk_categories_user_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_categories"),
        sa.UniqueConstraint("user_id", "id", name="uq_categories_user_id_id"),
        schema="public",
    )
    op.create_index(
        "uq_categories_user_normalized_name",
        "categories",
        ["user_id", sa.text("lower(btrim(name))")],
        unique=True,
        schema="public",
    )

    op.create_table(
        "tasks",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("scheduled_date", sa.Date(), nullable=False),
        sa.Column(
            "start_time",
            postgresql.TIME(precision=0, timezone=False),
            nullable=False,
        ),
        sa.Column("schedule_time_zone", sa.String(length=64), nullable=False),
        sa.Column("planned_minutes", sa.Integer(), nullable=False),
        sa.Column(
            "reminder_enabled",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column(
            "reminder_minutes_before",
            sa.SmallInteger(),
            server_default=sa.text("10"),
            nullable=False,
        ),
        sa.Column(
            "actual_completed_minutes",
            sa.Numeric(precision=12, scale=2),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "completion_state",
            sa.String(length=16),
            server_default=sa.text("'pending'"),
            nullable=False,
        ),
        sa.Column(
            "important",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "version",
            sa.Integer(),
            server_default=sa.text("1"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("btrim(title) <> ''", name="ck_tasks_title_not_blank"),
        sa.CheckConstraint("planned_minutes > 0", name="ck_tasks_planned_minutes_positive"),
        sa.CheckConstraint(
            "actual_completed_minutes >= 0 AND actual_completed_minutes <= planned_minutes",
            name="ck_tasks_completed_minutes_range",
        ),
        sa.CheckConstraint(
            "reminder_minutes_before >= 0",
            name="ck_tasks_reminder_minutes_nonnegative",
        ),
        sa.CheckConstraint("version >= 1", name="ck_tasks_version_positive"),
        sa.CheckConstraint(
            "btrim(schedule_time_zone) <> ''",
            name="ck_tasks_schedule_time_zone_not_blank",
        ),
        sa.CheckConstraint(
            "completion_state IN ('pending', 'partial', 'completed', 'incomplete')",
            name="ck_tasks_completion_state_valid",
        ),
        sa.CheckConstraint(
            "(completion_state IN ('pending', 'incomplete') "
            "AND actual_completed_minutes = 0 AND completed_at IS NULL) OR "
            "(completion_state = 'partial' AND actual_completed_minutes > 0 "
            "AND actual_completed_minutes < planned_minutes AND completed_at IS NULL) OR "
            "(completion_state = 'completed' "
            "AND actual_completed_minutes = planned_minutes AND completed_at IS NOT NULL)",
            name="ck_tasks_completion_state_consistent",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["auth.users.id"],
            name="fk_tasks_user_id_users",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id", "category_id"],
            ["public.categories.user_id", "public.categories.id"],
            name="fk_tasks_user_category_categories",
            ondelete="NO ACTION",
            deferrable=True,
            initially="DEFERRED",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_tasks"),
        sa.UniqueConstraint("user_id", "id", name="uq_tasks_user_id_id"),
        schema="public",
    )
    op.create_index(
        "ix_tasks_user_category",
        "tasks",
        ["user_id", "category_id"],
        schema="public",
    )
    op.create_index(
        "ix_tasks_user_schedule",
        "tasks",
        ["user_id", "scheduled_date", "start_time"],
        schema="public",
    )
    op.create_index(
        "ix_tasks_user_state_date",
        "tasks",
        ["user_id", "completion_state", "scheduled_date"],
        schema="public",
    )

    op.create_table(
        "activity_days",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("activity_date", sa.Date(), nullable=False),
        sa.Column(
            "recorded_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["auth.users.id"],
            name="fk_activity_days_user_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_id", "activity_date", name="pk_activity_days"),
        schema="public",
    )

    op.create_table(
        "completion_events",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["auth.users.id"],
            name="fk_completion_events_user_id_users",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id", "task_id"],
            ["public.tasks.user_id", "public.tasks.id"],
            name="fk_completion_events_user_task_tasks",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_completion_events"),
        sa.UniqueConstraint(
            "user_id",
            "task_id",
            name="uq_completion_events_user_task",
        ),
        schema="public",
    )
    op.create_index(
        "ix_completion_events_user_completed_at",
        "completion_events",
        ["user_id", "completed_at"],
        schema="public",
    )

    for table_name in PLANNER_TABLE_NAMES:
        qualified_table_name = f"public.{table_name}"
        op.execute(
            f"REVOKE ALL PRIVILEGES ON TABLE {qualified_table_name} FROM anon, authenticated"
        )
        op.execute(
            f"GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE {qualified_table_name} "
            f"TO {RUNTIME_DATABASE_ROLE}"
        )
        op.execute(f"ALTER TABLE {qualified_table_name} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY {table_name}_user_isolation ON {qualified_table_name} "
            f"FOR ALL TO {RUNTIME_DATABASE_ROLE} "
            f"USING (user_id = {CURRENT_USER_SETTING}) "
            f"WITH CHECK (user_id = {CURRENT_USER_SETTING})"
        )


def downgrade() -> None:
    op.drop_table("completion_events", schema="public")
    op.drop_table("activity_days", schema="public")
    op.drop_table("tasks", schema="public")
    op.drop_table("categories", schema="public")
    op.drop_table("user_settings", schema="public")
