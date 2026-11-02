# Let's Do Backend

The Let's Do backend is a typed FastAPI application that exposes authenticated planner APIs over PostgreSQL. Supabase Auth issues access tokens; FastAPI verifies them through the project's ES256 JWKS and uses the verified user UUID for application ownership checks and PostgreSQL row-level security.

## Technology

- Python 3.12
- FastAPI and Pydantic
- SQLAlchemy 2 with async psycopg
- PostgreSQL and Alembic
- Supabase Auth ES256 JWTs
- pytest and Ruff

Production dependencies are pinned in `requirements.txt`. `pyproject.toml` remains the source for application dependency ranges and the optional development tool set.

## Structure

```text
backend/
├── alembic/             # Migration environment and versioned migrations
├── app/
│   ├── api/             # Dependencies and route modules
│   ├── core/            # Configuration, errors, JWT verification, and V1 time zone
│   ├── db/              # Declarative base, async engine, and sessions
│   ├── models/          # Planner SQLAlchemy models
│   ├── services/        # Legacy browser-data import
│   └── main.py          # FastAPI construction and middleware
├── tests/               # Unit/API tests and opt-in live security tests
├── pyproject.toml
└── requirements.txt
```

## Local setup

Use a development Supabase project or a compatible PostgreSQL database containing the Supabase `auth.users` table required by planner ownership foreign keys.

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -e ".[dev]"
cp .env.example .env
```

Configure `.env` without committing it:

| Variable | Required | Purpose |
| --- | --- | --- |
| `APP_NAME` | No | OpenAPI application name. |
| `APP_ENVIRONMENT` | Yes | `development`, `test`, or `production`. |
| `APP_DEBUG` | No | Must be `false` in production. |
| `CORS_ALLOWED_ORIGINS` | Yes | Comma-separated exact frontend origins. Production origins must use HTTPS. |
| `DATABASE_URL` | Yes | Restricted `lets_do_api` runtime connection. |
| `MIGRATION_DATABASE_URL` | For Alembic | Privileged migration-owner connection; never use it to run FastAPI. |
| `SUPABASE_URL` | Yes | Public Supabase project URL. Must use HTTPS in production. |
| `SUPABASE_JWT_AUDIENCE` | No | Normally `authenticated`. |

PostgreSQL URLs using `postgresql://` are normalized to the psycopg driver. Production database URLs must set a supported encrypted libpq mode: `sslmode=require`, `sslmode=verify-ca`, or `sslmode=verify-full`.

Start the application after preparing the database:

```bash
alembic upgrade head
uvicorn app.main:app --reload
```

Interactive OpenAPI documentation is available from FastAPI at `/docs` in environments where it has not been disabled by infrastructure.

## Authentication

`Authorization: Bearer <access-token>` is required for every `/api/v1` route. Public health endpoints are the only exceptions.

The verifier requires:

- ES256 with an EC P-256 signing key from the Supabase JWKS endpoint
- JWT `typ` of `JWT`
- Matching issuer and audience
- Required `aud`, `exp`, `iat`, `iss`, `role`, and `sub` claims
- Supabase role `authenticated`
- A UUID user subject

JWKS keys are cached for ten minutes. Invalid or expired tokens return structured `401` responses; unavailable JWKS returns `503` rather than accepting an unverifiable token. The backend never needs a JWT secret or Supabase service-role key.

## API

All protected routes use the authenticated user UUID. Planner-data routes also use the authenticated database transaction dependency; `/api/v1/auth/me` verifies and returns token identity without opening a database transaction.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Public process health. |
| `GET` | `/health/database` | Public database connectivity check. |
| `GET` | `/api/v1/auth/me` | Return limited verified token identity. |
| `GET` | `/api/v1/settings` | Read settings or V1 defaults. |
| `PUT` | `/api/v1/settings` | Atomically upsert theme, sidebar, and `Asia/Kolkata` settings. |
| `GET` | `/api/v1/categories` | List owned categories. |
| `POST` | `/api/v1/categories` | Create a normalized owned category. |
| `PATCH` | `/api/v1/categories/{id}` | Rename an owned category. |
| `DELETE` | `/api/v1/categories/{id}` | Delete an unused owned category. |
| `GET` | `/api/v1/tasks` | List owned tasks chronologically. |
| `GET` | `/api/v1/tasks/{id}` | Read one owned task. |
| `POST` | `/api/v1/tasks` | Create a task and record activity. |
| `PATCH` | `/api/v1/tasks/{id}` | Update a task using its current version. |
| `PATCH` | `/api/v1/tasks/{id}/completion` | Complete, toggle Partial, mark Incomplete, or reopen. |
| `DELETE` | `/api/v1/tasks/{id}?version=…` | Delete a task using its current version. |
| `GET` | `/api/v1/activity` | Read activity dates and completion events. |
| `POST` | `/api/v1/activity/review` | Explicitly confirm today's India-calendar review. |
| `POST` | `/api/v1/imports/local-storage/preview` | Validate and preview legacy browser data. |
| `POST` | `/api/v1/imports/local-storage` | Commit the exact confirmed import payload. |

Request models reject unexpected fields. Categories are unique per user after trimming and case normalization. Task creation and scheduling updates return a `409` warning containing duplicate or overlap references unless the caller explicitly confirms them.

Task mutation requests carry a positive `version`. SQLAlchemy version checking rejects stale changes with `task_version_conflict`, allowing the frontend to refresh rather than overwrite another session's update.

Errors use a stable shape:

```json
{
  "error": {
    "code": "machine_readable_code",
    "message": "Human-readable message",
    "details": {}
  }
}
```

`details` is included only when applicable.

## Database

PostgreSQL is authoritative for five planner tables:

| Table | Responsibility |
| --- | --- |
| `public.user_settings` | Theme, collapsed sidebar, and retained time-zone metadata. |
| `public.categories` | Per-user normalized category names. |
| `public.tasks` | Scheduling, reminder preferences, outcome, progress, timestamps, and version. |
| `public.activity_days` | Unique explicit planning-activity dates. |
| `public.completion_events` | UTC events for fully completed eligible tasks. |

Every planner row is owned by a Supabase `auth.users` UUID. Composite foreign keys prevent a task from referencing another user's category and a completion event from referencing another user's task. Constraints enforce positive durations, bounded completed minutes, valid states, and state/progress consistency. Deleting a Supabase user cascades through owned planner data.

Task schedules store an India wall-clock date and time plus `schedule_time_zone`. New V1 writes accept only `Asia/Kolkata`; legacy time-zone metadata is interpreted as India scheduling without shifting stored dates or times. Event timestamps remain UTC-aware.

### Database roles and migrations

Use separate credentials:

- **Migration role:** owns/creates schema objects, adds Supabase Auth foreign keys, grants runtime table access, and installs RLS policies.
- **Runtime role (`lets_do_api`):** can operate only on planner tables through the policies. It must not own those tables, bypass RLS, inherit elevated roles, or create schema objects.

Create the runtime role manually with a strong secret managed outside the repository. Its effective attributes must include `NOINHERIT`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOREPLICATION`, and `NOBYPASSRLS`. As an administrator, configure shared-schema access separately because Alembic intentionally does not manage it:

```sql
REVOKE CREATE ON SCHEMA public FROM lets_do_api;
GRANT USAGE ON SCHEMA public TO lets_do_api;
```

The runtime role must exist before the initial migration. Then run with `MIGRATION_DATABASE_URL`:

```bash
alembic upgrade head
```

The migrations create planner tables, reference `auth.users`, revoke table access from Supabase `anon` and `authenticated`, grant the restricted runtime role, enable RLS, and remove the obsolete daily-capacity column in the second revision.

Each authenticated API transaction executes:

```sql
SELECT set_config('app.current_user_id', '<verified-user-uuid>', true);
```

The third argument makes the identity transaction-local, so commit or rollback clears it before a pooled connection is reused. RLS policies compare every row's `user_id` to that setting. Successful dependencies commit; exceptions roll back.

## Legacy browser-data import

The import service accepts version 1 and 2 browser planner payloads. Preview and commit are bound by a SHA-256 digest of the exact serialized state and options. Deterministic user-scoped identifiers and insert-if-absent behavior make retries safe without replacing server data. Valid entities are imported in one transaction, invalid records are reported and skipped, and unexpected errors roll back the request. The original `localStorage` value is never changed by the backend.

## Checks

```bash
.venv/bin/pytest
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/pip check
```

The normal suite uses dependency substitution and compiled PostgreSQL migration SQL; it does not contact Supabase. The opt-in suite in [tests/integration/README.md](tests/integration/README.md) audits the development project and exercises two disposable users. That live multi-user isolation run remains pending and must never target production.

## Production

The API is deployed on Render Singapore at <https://lets-do-api.onrender.com>. It uses the pinned `requirements.txt`, Python 3.12, the Uvicorn `$PORT` start command, and `/health` for process health. Exact Cloudflare-origin CORS and PostgreSQL TLS are validated when `APP_ENVIRONMENT=production`.

See [../docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md). Render free-tier instances can sleep and produce noticeable cold-start latency.
