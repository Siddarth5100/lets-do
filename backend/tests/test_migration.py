from importlib.util import module_from_spec, spec_from_file_location
from io import StringIO
from pathlib import Path
from types import ModuleType

from alembic.migration import MigrationContext
from alembic.operations import Operations

MIGRATION_DIRECTORY = Path(__file__).parents[1] / "alembic" / "versions"
INITIAL_MIGRATION_PATH = MIGRATION_DIRECTORY / "20261026_01_create_planner_tables.py"
REMOVE_DAILY_CAPACITY_MIGRATION_PATH = MIGRATION_DIRECTORY / "20261027_01_remove_daily_capacity.py"


def load_migration(migration_path: Path) -> ModuleType:
    module_spec = spec_from_file_location("planner_schema_migration", migration_path)
    if module_spec is None or module_spec.loader is None:
        raise RuntimeError("Could not load planner schema migration")

    migration = module_from_spec(module_spec)
    module_spec.loader.exec_module(migration)
    return migration


def render_migration_sql(direction: str, migration_path: Path = INITIAL_MIGRATION_PATH) -> str:
    output = StringIO()
    migration_context = MigrationContext.configure(
        dialect_name="postgresql",
        opts={"as_sql": True, "output_buffer": output},
    )
    migration = load_migration(migration_path)
    migration.op = Operations(migration_context)
    getattr(migration, direction)()
    return output.getvalue()


def test_upgrade_generates_postgresql_compatible_schema_sql() -> None:
    migration_sql = render_migration_sql("upgrade")

    assert migration_sql.count("CREATE TABLE") == 5
    assert migration_sql.count("CREATE TABLE public.") == 5
    assert "schedule_time_zone VARCHAR(64) NOT NULL" in migration_sql
    assert "actual_completed_minutes <= planned_minutes" in migration_sql
    assert "REFERENCES auth.users (id) ON DELETE CASCADE" in migration_sql
    assert "FOREIGN KEY(user_id, category_id)" in migration_sql
    assert "DEFERRABLE INITIALLY DEFERRED" in migration_sql
    assert "CREATE UNIQUE INDEX uq_categories_user_normalized_name" in migration_sql


def test_upgrade_restricts_direct_access_and_adds_runtime_rls_policies() -> None:
    migration_sql = render_migration_sql("upgrade")

    assert "CREATE ROLE" not in migration_sql
    assert "REVOKE CREATE ON SCHEMA" not in migration_sql
    assert "GRANT USAGE ON SCHEMA" not in migration_sql
    assert migration_sql.count("ENABLE ROW LEVEL SECURITY") == 5
    assert migration_sql.count("FOR ALL TO lets_do_api") == 5
    assert migration_sql.count("current_setting('app.current_user_id', true)") == 10
    assert migration_sql.count("FROM anon, authenticated") == 5


def test_downgrade_drops_only_planner_tables_in_dependency_order() -> None:
    migration_sql = render_migration_sql("downgrade")
    expected_order = [
        "completion_events",
        "activity_days",
        "tasks",
        "categories",
        "user_settings",
    ]
    drop_positions = [
        migration_sql.index(f"DROP TABLE public.{table_name}") for table_name in expected_order
    ]

    assert drop_positions == sorted(drop_positions)
    assert "DROP TABLE auth.users" not in migration_sql


def test_daily_capacity_removal_migration_is_reversible() -> None:
    upgrade_sql = render_migration_sql("upgrade", REMOVE_DAILY_CAPACITY_MIGRATION_PATH)
    downgrade_sql = render_migration_sql("downgrade", REMOVE_DAILY_CAPACITY_MIGRATION_PATH)

    assert (
        "ALTER TABLE public.user_settings "
        "DROP CONSTRAINT ck_user_settings_daily_capacity_minutes_range" in upgrade_sql
    )
    assert "ALTER TABLE public.user_settings DROP COLUMN daily_capacity_minutes" in upgrade_sql
    assert "ADD COLUMN daily_capacity_minutes SMALLINT DEFAULT 480 NOT NULL" in downgrade_sql
    assert (
        "ADD CONSTRAINT ck_user_settings_daily_capacity_minutes_range "
        "CHECK (daily_capacity_minutes BETWEEN 1 AND 1440)" in downgrade_sql
    )
