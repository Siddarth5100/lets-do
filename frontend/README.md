# Let's Do Frontend

The responsive frontend for Let's Do, a personal daily planner and progress-tracking application. Task and preference data currently persists in the browser through `localStorage`.

## Technology Stack

- React 19 and React DOM
- TypeScript 6
- Vite 8
- Tailwind CSS 4
- Oxlint
- Vitest

## Prerequisites

- Node.js 24 is recommended. The installed tooling also supports Node.js 22.12.x and 26 or later.
- npm

## Installation and Development

From the repository root:

```bash
cd frontend
npm install
npm run dev
```

Vite prints the local development URL when the server starts.

## Quality Checks and Production Build

```bash
npm run lint     # Run Oxlint
npm test         # Run the Vitest unit tests once
npm run build    # Type-check and create a production build
npm run preview  # Preview the production build locally
```

## Source Structure

```text
src/
├── components/   # Calendar, dashboard, layout, settings, task, and shared UI components
├── data/         # Default categories, weekday slogans, and themes
├── hooks/        # Planner state and persistence behavior
├── types/        # Planner domain types
├── utils/        # Date, scoring, storage, and task-validation logic with unit tests
├── App.tsx       # Application composition and view coordination
├── index.css     # Tailwind imports and shared styles
└── main.tsx      # React entry point
```

## Current Features

- Responsive Today, Calendar, task form, and Settings views
- Task creation, editing, deletion, importance, categories, scheduling, and estimated duration
- Persisted custom categories and collapsible desktop sidebar preference
- Pending, partial, and completed task states with duration-weighted points
- Separate activity and completion streaks
- Available-hours and daily-progress indicators
- Same-day duplicate-name and active-task overlap warnings with confirmation
- Seven automatic weekday themes with manual selection
- Versioned `localStorage` persistence with migration of earlier planner data
- Stored reminder preferences without notification delivery

## Known Limitations

- Data is local to one browser and is not synchronized between devices.
- Backend services, accounts, authentication, and cloud persistence are not implemented.
- Reminder preferences do not schedule or deliver notifications.
- Recurring routines and streak-pausing rest days are not implemented.
- Navigation is application state-based and does not provide shareable view URLs.
- Inter is loaded from Google Fonts; the system font stack is used when it is unavailable.
