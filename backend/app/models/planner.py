from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Table,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import TIME as PostgreSQLTime
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

# This metadata-only table lets SQLAlchemy resolve foreign keys to the Supabase-owned
# auth schema. Alembic excludes it from generated application migrations.
supabase_auth_users = Table(
    "users",
    Base.metadata,
    Column("id", PostgreSQLUuid(as_uuid=True), primary_key=True),
    schema="auth",
    info={"external": True},
)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class UserSettings(TimestampMixin, Base):
    __tablename__ = "user_settings"
    __table_args__ = (
        CheckConstraint(
            "daily_capacity_minutes BETWEEN 1 AND 1440",
            name="daily_capacity_minutes_range",
        ),
        CheckConstraint("btrim(time_zone) <> ''", name="time_zone_not_blank"),
        CheckConstraint(
            "manual_theme_id IS NULL OR manual_theme_id IN "
            "('sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday')",
            name="manual_theme_id_valid",
        ),
        {"schema": "public"},
    )

    user_id: Mapped[UUID] = mapped_column(
        PostgreSQLUuid(as_uuid=True),
        ForeignKey(supabase_auth_users.c.id, ondelete="CASCADE"),
        primary_key=True,
    )
    daily_capacity_minutes: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        server_default=text("480"),
    )
    manual_theme_id: Mapped[str | None] = mapped_column(String(16))
    sidebar_collapsed: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("false"),
    )
    time_zone: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        server_default=text("'UTC'"),
    )


class Category(TimestampMixin, Base):
    __tablename__ = "categories"
    __table_args__ = (
        CheckConstraint("btrim(name) <> ''", name="name_not_blank"),
        UniqueConstraint("user_id", "id", name="uq_categories_user_id_id"),
        Index(
            "uq_categories_user_normalized_name",
            "user_id",
            func.lower(func.btrim(text("name"))),
            unique=True,
        ),
        {"schema": "public"},
    )

    id: Mapped[UUID] = mapped_column(
        PostgreSQLUuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[UUID] = mapped_column(
        PostgreSQLUuid(as_uuid=True),
        ForeignKey(supabase_auth_users.c.id, ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)

    tasks: Mapped[list[Task]] = relationship(
        back_populates="category",
        passive_deletes=True,
    )


class Task(TimestampMixin, Base):
    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint("btrim(title) <> ''", name="title_not_blank"),
        CheckConstraint("planned_minutes > 0", name="planned_minutes_positive"),
        CheckConstraint(
            "actual_completed_minutes >= 0 AND actual_completed_minutes <= planned_minutes",
            name="completed_minutes_range",
        ),
        CheckConstraint("reminder_minutes_before >= 0", name="reminder_minutes_nonnegative"),
        CheckConstraint("version >= 1", name="version_positive"),
        CheckConstraint("btrim(schedule_time_zone) <> ''", name="schedule_time_zone_not_blank"),
        CheckConstraint(
            "completion_state IN ('pending', 'partial', 'completed', 'incomplete')",
            name="completion_state_valid",
        ),
        CheckConstraint(
            "(completion_state IN ('pending', 'incomplete') "
            "AND actual_completed_minutes = 0 AND completed_at IS NULL) OR "
            "(completion_state = 'partial' AND actual_completed_minutes > 0 "
            "AND actual_completed_minutes < planned_minutes AND completed_at IS NULL) OR "
            "(completion_state = 'completed' "
            "AND actual_completed_minutes = planned_minutes AND completed_at IS NOT NULL)",
            name="completion_state_consistent",
        ),
        UniqueConstraint("user_id", "id", name="uq_tasks_user_id_id"),
        ForeignKeyConstraint(
            ["user_id", "category_id"],
            ["public.categories.user_id", "public.categories.id"],
            name="fk_tasks_user_category_categories",
            ondelete="NO ACTION",
            deferrable=True,
            initially="DEFERRED",
        ),
        Index("ix_tasks_user_schedule", "user_id", "scheduled_date", "start_time"),
        Index(
            "ix_tasks_user_state_date",
            "user_id",
            "completion_state",
            "scheduled_date",
        ),
        Index("ix_tasks_user_category", "user_id", "category_id"),
        {"schema": "public"},
    )

    id: Mapped[UUID] = mapped_column(
        PostgreSQLUuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[UUID] = mapped_column(
        PostgreSQLUuid(as_uuid=True),
        ForeignKey(supabase_auth_users.c.id, ondelete="CASCADE"),
        nullable=False,
    )
    category_id: Mapped[UUID] = mapped_column(PostgreSQLUuid(as_uuid=True), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    scheduled_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time] = mapped_column(
        PostgreSQLTime(precision=0, timezone=False),
        nullable=False,
    )
    schedule_time_zone: Mapped[str] = mapped_column(String(64), nullable=False)
    planned_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    reminder_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("false"),
    )
    reminder_minutes_before: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        server_default=text("10"),
    )
    actual_completed_minutes: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        server_default=text("0"),
    )
    completion_state: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        server_default=text("'pending'"),
    )
    important: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("false"),
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("1"))

    __mapper_args__ = {"version_id_col": version}

    category: Mapped[Category] = relationship(back_populates="tasks")
    completion_event: Mapped[CompletionEvent | None] = relationship(
        back_populates="task",
        passive_deletes=True,
        uselist=False,
    )


class ActivityDay(Base):
    __tablename__ = "activity_days"
    __table_args__ = {"schema": "public"}

    user_id: Mapped[UUID] = mapped_column(
        PostgreSQLUuid(as_uuid=True),
        ForeignKey(supabase_auth_users.c.id, ondelete="CASCADE"),
        primary_key=True,
    )
    activity_date: Mapped[date] = mapped_column(Date, primary_key=True)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class CompletionEvent(Base):
    __tablename__ = "completion_events"
    __table_args__ = (
        UniqueConstraint("user_id", "task_id", name="uq_completion_events_user_task"),
        ForeignKeyConstraint(
            ["user_id", "task_id"],
            ["public.tasks.user_id", "public.tasks.id"],
            name="fk_completion_events_user_task_tasks",
            ondelete="CASCADE",
        ),
        Index("ix_completion_events_user_completed_at", "user_id", "completed_at"),
        {"schema": "public"},
    )

    id: Mapped[UUID] = mapped_column(
        PostgreSQLUuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[UUID] = mapped_column(
        PostgreSQLUuid(as_uuid=True),
        ForeignKey(supabase_auth_users.c.id, ondelete="CASCADE"),
        nullable=False,
    )
    task_id: Mapped[UUID | None] = mapped_column(PostgreSQLUuid(as_uuid=True))
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    task: Mapped[Task | None] = relationship(back_populates="completion_event")
