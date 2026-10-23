# Let's Do

**Plan it. Do it. Feel good.**

Let's Do is a responsive daily planner for scheduling tasks, tracking meaningful progress, and building separate planning and completion streaks. The v1 implementation is a browser-based React application; backend services and accounts are planned but are not part of the current release.

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
├── frontend/    # React, TypeScript, Vite, Tailwind CSS, and Vitest application
└── AGENTS.md    # Development workflow and project conventions
```

## Run Locally

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

## Planned Beyond v1

Python/FastAPI services, PostgreSQL, Supabase authentication, cross-device synchronization, recurring routines, rest days, and real notification delivery remain future work.
