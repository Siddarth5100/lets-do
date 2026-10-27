"""Remove the fixed daily capacity setting.

Revision ID: 20261027_01
Revises: 20261026_01
Create Date: 2026-10-27
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20261027_01"
down_revision: str | None = "20261026_01"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(
        "ck_user_settings_daily_capacity_minutes_range",
        "user_settings",
        schema="public",
        type_="check",
    )
    op.drop_column(
        "user_settings",
        "daily_capacity_minutes",
        schema="public",
    )


def downgrade() -> None:
    op.add_column(
        "user_settings",
        sa.Column(
            "daily_capacity_minutes",
            sa.SmallInteger(),
            server_default=sa.text("480"),
            nullable=False,
        ),
        schema="public",
    )
    op.create_check_constraint(
        "ck_user_settings_daily_capacity_minutes_range",
        "user_settings",
        "daily_capacity_minutes BETWEEN 1 AND 1440",
        schema="public",
    )
