import os

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://test_user:test_password@localhost:5432/test_database",
)
os.environ.setdefault("SUPABASE_URL", "https://test-project.supabase.co")
