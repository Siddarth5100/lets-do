# Let's Do

**Plan it. Do it. Feel good.**

Let's Do is a responsive daily planner for scheduling tasks, tracking meaningful progress, and building separate planning and completion streaks. The repository contains the v1 React frontend and the initial FastAPI backend foundation.

## Current v1

- Today dashboard with categorized tasks, live time remaining, progress, and streaks
- Calendar and Review Plan views for inspecting scheduled days
- Task creation, editing, deletion, outcomes, importance, categories, and rescheduling
- Duration-weighted scoring and explicit activity/completion history
- Seven weekday themes, daily capacity, and responsive desktop/mobile navigation
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

## Backend Foundation

The backend currently provides application and database health checks, environment-based configuration, SQLAlchemy session management, Alembic migration infrastructure, and structured API errors. Authentication, planner tables, task APIs, and frontend integration are intentionally deferred.

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

Set `DATABASE_URL` in `.env` to the PostgreSQL connection string supplied by your database provider. The application accepts both `postgresql://` and `postgresql+psycopg://` URLs and uses the psycopg driver. Do not commit `.env` or database credentials.

Start the API:

```bash
alembic upgrade head
uvicorn app.main:app --reload
```

Available health endpoints:

- `GET /health` checks that the API process is responding.
- `GET /health/database` executes `SELECT 1` against PostgreSQL and returns HTTP 503 if the database cannot be reached.

Run backend checks from `backend/`:

```bash
pytest
ruff check app tests
```

Alembic is configured but contains no application-table migrations yet. A reachable database is required for Alembic commands and the live database health endpoint; automated tests use a substituted database session and do not require Supabase credentials.

## Planned Beyond v1

Supabase authentication, planner database models and APIs, frontend integration, cross-device synchronization, recurring routines, rest days, and real notification delivery remain future work.
