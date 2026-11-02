# Let's Do

**Plan it. Do it. Feel good.**

Let's Do is an authenticated daily planner for scheduling work, tracking meaningful progress, and maintaining separate activity and completion streaks. PostgreSQL is the authoritative planner store; the React frontend accesses it through the FastAPI API using Supabase Auth access tokens.

## Current v1

- Today dashboard with categorized tasks, live time remaining, progress, and streaks
- Calendar and Review Plan views with overnight and multi-day scheduling
- Task creation, editing, deletion, importance, outcomes, and cutoff-based rescheduling
- Custom categories, weekday themes, persisted settings, and responsive navigation
- Duration-weighted scoring with explicit Pending, Partial, Completed, and Incomplete outcomes
- Signup, email confirmation and resend, login, session restoration, logout, and password recovery
- User-confirmed import of legacy browser planner data
- Per-user PostgreSQL isolation through authenticated API ownership checks and row-level security

V1 scheduling uses `Asia/Kolkata`. Task schedules retain their wall-clock date, time, and time-zone metadata, while completion and audit timestamps are stored as UTC-aware timestamps.

## Architecture

```text
Cloudflare Pages (React)
   ├── Supabase Auth (sessions, signup, confirmation, recovery)
   └── Render Singapore (FastAPI)
          ├── Supabase JWKS (ES256 token verification)
          └── Supabase PostgreSQL Singapore
                 └── restricted lets_do_api role + per-user RLS
```

Production services:

- Frontend: <https://lets-do.pages.dev>
- API: <https://lets-do-api.onrender.com>
- Database and authentication: Supabase Singapore
- Current production deployment branch: `feat/frontend-integration`

Development uses a separate Supabase Sydney project. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the deployment and environment checklist.

## Repository structure

```text
.
├── backend/              # FastAPI, SQLAlchemy, PostgreSQL, Alembic, and pytest
├── frontend/             # React, TypeScript, Vite, Tailwind CSS, and Vitest
├── docs/
│   ├── DEPLOYMENT.md     # Production configuration and release checks
│   └── PROJECT_STATUS.md # Handover, pending work, and technical decisions
└── AGENTS.md             # Development workflow and project conventions
```

Detailed documentation:

- [Frontend setup and architecture](frontend/README.md)
- [Backend setup, APIs, database, and security](backend/README.md)
- [Production deployment](docs/DEPLOYMENT.md)
- [Project status and handover](docs/PROJECT_STATUS.md)
- [Opt-in Supabase security tests](backend/tests/integration/README.md)

## Local setup

Prerequisites:

- Node.js `^20.19.0` or `>=22.12.0` and npm
- Python 3.12
- A development Supabase project with PostgreSQL and ES256 Auth signing keys

Start the backend:

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -e ".[dev]"
cp .env.example .env
# Configure the development database and Supabase values in .env.
alembic upgrade head
uvicorn app.main:app --reload
```

The restricted runtime role and migration role must be prepared before applying migrations. Follow [backend/README.md](backend/README.md#database-roles-and-migrations); never run the API with migration-owner credentials.

Start the frontend in another terminal:

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

The Vite development server proxies `/api` to the configured local backend.

## Core business rules

- Maximum task points are `max(1, plannedMinutes / 60)`.
- Earned points are proportional to completed minutes and never exceed maximum points.
- Partial records exactly 50% of the planned duration and points.
- Completed records full progress and create a completion event when the task is not future-dated.
- Incomplete records zero progress after explicit confirmation.
- Scheduled time passing never awards points or changes the stored outcome.
- Duplicate names and schedule overlaps produce warnings that require explicit confirmation.
- Overlapping allocations are merged when calculating available time.
- Rescheduling is allowed only before one hour prior to the original scheduled start.
- Activity and completion streaks are independent and use India calendar dates.

## Persistence and isolation

- PostgreSQL is the authoritative source for tasks, categories, settings, activity days, and completion events.
- Task versions provide optimistic concurrency protection across sessions and devices.
- Every authenticated database transaction sets `app.current_user_id` locally from the verified JWT user UUID; PostgreSQL RLS uses it for ownership isolation.
- Legacy planner state under `lets-do.planner.v1` remains in `localStorage` and is imported only after user preview and confirmation. Importing never deletes the browser copy or existing server data.
- Active view and Review Plan date use `sessionStorage` under `lets-do.navigation.v1`; they survive refresh in one tab but do not carry into a fresh tab.

## Verification

Backend:

```bash
cd backend
.venv/bin/pytest
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/pip check
```

Frontend:

```bash
cd frontend
npm test
npm run lint
npx tsc -b --pretty false
npm run build
```

The regular backend suite is isolated from live Supabase resources. Live cross-user security checks are opt-in and documented separately.

## Known limitations

- V1 supports India (`Asia/Kolkata`) scheduling only; multi-time-zone accounts are deferred.
- Reminder preferences are stored, but notifications are not delivered.
- Recurring routines, streak-pausing rest days, cancellation, and overdue automation are not implemented.
- Navigation is state-based rather than URL-routed, so views do not have shareable URLs or browser-history navigation.
- Category rename/delete APIs exist, but the current frontend exposes category creation only.
- Render's free tier can introduce backend cold-start latency.
- Production email delivery is not ready until a verified sending domain and production SMTP configuration replace Resend's testing-domain restrictions.
- The automated live multi-user isolation suite still needs to be run against the designated development Supabase project with disposable accounts.
