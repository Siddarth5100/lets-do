# Let's Do

**Plan it. Do it. Feel good.**

Let's Do is a responsive daily planner for scheduling tasks, tracking meaningful progress, and building separate planning and completion streaks. The repository contains the v1 React frontend and the initial FastAPI backend foundation.

## Current v1

- Today dashboard with categorized tasks, live time remaining, progress, and streaks
- Calendar and Review Plan views for inspecting scheduled days
- Task creation, editing, deletion, outcomes, importance, categories, and rescheduling
- Duration-weighted scoring and explicit activity/completion history
- Seven weekday themes and responsive desktop/mobile navigation
- Versioned browser persistence with no account required

## Repository Structure

```text
.
├── backend/     # FastAPI, SQLAlchemy, PostgreSQL, Alembic, and pytest foundation
├── frontend/    # React, TypeScript, Vite, Tailwind CSS, and Vitest application
└── AGENTS.md    # Development workflow and project conventions
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Run the v1 quality checks from `frontend/`:

```bash
npm test
npm run lint
./node_modules/.bin/tsc -p tsconfig.app.json --noEmit
npm run build
```

## Core v1 Rules

- Tasks earn `max(1, plannedMinutes / 60)` possible points. Earned points are proportional to completed minutes, capped at the planned duration.
- Partial records exactly 50% progress; Completed records full progress; Incomplete records zero progress after confirmation.
- Overnight and multi-day schedules participate in overlap detection and daily availability without double-counting overlapping time.
- Planner data is versioned in `localStorage`. Per-tab navigation state is kept separately in `sessionStorage`.

See [frontend/README.md](frontend/README.md) for the architecture, commands, business rules, storage behavior, and current limitations.

## Backend

The backend provides application and database health checks, environment-based configuration, async SQLAlchemy session management, Alembic migration infrastructure, structured API errors, and Supabase access-token verification. Planner tables, task APIs, and frontend integration remain deferred.

Prerequisites:

- Python 3.12 or newer
- A PostgreSQL database, such as a Supabase PostgreSQL project

Create the local environment from `backend/`:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e ".[dev]"
cp .env.example .env
```

Set these values in `.env`:

- `DATABASE_URL`: the restricted FastAPI runtime connection for the manually created `lets_do_api` role.
- `MIGRATION_DATABASE_URL`: a privileged direct or session connection used only by Alembic.
- `SUPABASE_URL`: the public project URL, such as `https://your-project-reference.supabase.co`.
- `SUPABASE_JWT_AUDIENCE`: normally `authenticated`.

The Supabase project must use an active ES256 asymmetric signing key. The backend reads public verification keys from the project's JWKS endpoint; no JWT secret or service-role key is required. Do not commit `.env` or database credentials.

Before applying planner migrations, create the `lets_do_api` role manually as a login role
with `NOINHERIT`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOREPLICATION`, and
`NOBYPASSRLS`.
The role must not own planner tables or inherit from the migration owner. Apply these shared-schema
permissions separately as an administrator; Alembic intentionally does not manage them:

```sql
REVOKE CREATE ON SCHEMA public FROM lets_do_api;
GRANT USAGE ON SCHEMA public TO lets_do_api;
```

The planner migration grants table-level access to this role and enables per-user RLS. Create the
role before running Alembic, and never start FastAPI with the privileged migration connection.

Start the API:

```bash
alembic upgrade head
uvicorn app.main:app --reload
```

Available health endpoints:

- `GET /health` checks that the API process is responding.
- `GET /health/database` executes `SELECT 1` against PostgreSQL and returns HTTP 503 if the database cannot be reached.

The protected identity endpoint accepts a Supabase access token:

```bash
curl http://localhost:8000/api/v1/auth/me \
  -H "Authorization: Bearer <supabase-access-token>"
```

It verifies the ES256 signature, issuer, audience, expiration, token type, authenticated role, and user UUID before returning limited identity information. The health endpoints remain public.

Run backend checks from `backend/`:

```bash
pytest
ruff check app tests
```

Alembic contains the initial planner-table migration. A reachable database is required for Alembic commands and the live database health endpoint. Automated tests compile the migration as PostgreSQL SQL, use substituted database and signing-key providers, generate temporary ES256 keys in memory, and do not require Supabase credentials or network access.

## Planned Beyond v1

React authentication flows, planner database models and APIs, frontend integration, cross-device synchronization, recurring routines, rest days, and real notification delivery remain future work.
