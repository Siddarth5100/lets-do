# Let's Do Frontend

The Let's Do v1 frontend is a responsive, browser-based daily planner. It schedules tasks across calendar days, tracks partial and complete outcomes, calculates duration-weighted points, and stores planner data locally without requiring an account.

## Technology

- React 19 and React DOM
- TypeScript 6 in strict mode
- Vite 8
- Tailwind CSS 4
- Oxlint
- Vitest

## Prerequisites

- Node.js `^20.19.0` or `>=22.12.0`
- npm

## Setup and Commands

Run commands from `frontend/`:

```bash
npm install
npm run dev       # Start the Vite development server
npm test          # Run unit tests once
npm run lint      # Run Oxlint
npm run build     # Type-check and create a production build
npm run preview   # Preview the production build
```

For an explicit strict TypeScript check without building:

```bash
./node_modules/.bin/tsc -p tsconfig.app.json --noEmit
```

## Source Architecture

```text
src/
├── components/   # Dashboard, calendar, review, settings, task, layout, and shared UI
├── data/         # Default categories, weekday slogans, and seven themes
├── hooks/        # Current local date and planner state coordination
├── types/        # Planner domain and navigation types
├── utils/        # Scoring, scheduling, transitions, validation, dates, and storage
├── App.tsx       # View, task-form, confirmation, and navigation orchestration
├── index.css     # Tailwind import and shared component styles
└── main.tsx      # React entry point
```

UI components delegate scoring, scheduling, validation, state transitions, and persistence to typed hooks and utility functions. Business-logic utilities have Vitest coverage.

## Current Features

- Responsive Today dashboard with categorized active tasks, outcome sections, daily slogan, live analog clock, time remaining, points progress, and separate streaks
- Calendar view for selecting dates and managing their tasks
- Review Plan view with date selection, chronological tasks, overnight and multi-day intersections, allocated/free time totals, merged overlap calculations, and available ranges
- Task creation and editing with custom categories, date, 24-hour start/end fields, automatically derived duration, importance, and stored reminder preferences
- Duplicate-name and schedule-overlap warnings that require explicit confirmation
- Rescheduling through the existing task form before the one-hour cutoff preceding the original start
- Collapsible desktop navigation, mobile navigation, session-restored active view, and persisted Review Plan date
- Seven automatic weekday themes with manual selection
- Accessible dialogs, task progress indicators, form errors, and keyboard-available Partial guidance

## Scoring and Outcomes

Maximum points are duration-weighted:

```text
maxPoints = max(1, plannedMinutes / 60)
earnedPoints = maxPoints × min(actualCompletedMinutes, plannedMinutes) / plannedMinutes
```

- **Pending:** zero completed minutes and zero points.
- **Partial:** exactly 50% of planned minutes and points. It remains active until its scheduled end, then appears in the Completed section as “Partially Completed” without becoming fully completed.
- **Completed:** 100% progress and full points. A qualifying completion event is recorded.
- **Incomplete:** zero progress and points after explicit confirmation.
- Completed, incomplete, and elapsed partial tasks can be corrected back to Pending.

Scheduled time passing never awards points or changes the stored outcome automatically.

## Streaks

- **Activity streak:** records local calendar dates for explicit planning actions such as creating, editing, completing, or confirming today's review. Opening the application does not count.
- **Completion streak:** records a timestamp when at least one eligible task is fully completed. Partial and incomplete outcomes do not qualify.
- Future planned tasks do not create completion events. Deleting or reopening a completed task removes its associated completion event while preserving genuine planning activity history.
- Missing days break streaks; the current day does not break a streak while still in progress.

Rest-day streak pausing is not implemented.

## Storage

- Planner state uses versioned `localStorage` under `lets-do.planner.v1`. The loader preserves supported earlier data and migrates version 1 completion timestamps to the current event model.
- Active view and Review Plan date use `sessionStorage` under `lets-do.navigation.v1`, so refreshes in the same tab restore navigation while a fresh tab starts on Today.
- Invalid, malformed, blocked, or unwritable storage is handled with safe fallbacks; planner write failures display an in-app warning.

All data remains in the current browser profile and is not synchronized or backed up remotely.

## Known Limitations

- No backend, database, authentication, accounts, or cross-device synchronization
- Reminder settings are stored but notifications are not scheduled or delivered
- No recurring routines, rest-day streak pauses, cancellation, or overdue automation
- Navigation is state-based and does not provide shareable URLs or browser history routes
- Daily planned time is calculated from scheduled tasks and does not restrict scheduling
- Inter is loaded from Google Fonts, with the configured system font stack as fallback
