# Let's Do Frontend

The Let's Do frontend is a responsive React application backed by the authenticated FastAPI planner API. PostgreSQL is authoritative; browser storage is limited to per-tab navigation and an explicit migration path for older browser-only data.

## Technology

- React 19 and React DOM
- TypeScript 6 in strict mode
- Vite 8
- Tailwind CSS 4
- Supabase JavaScript client
- Oxlint and Vitest

## Prerequisites

- Node.js `^20.19.0` or `>=22.12.0`
- npm
- A running Let's Do backend
- Supabase project URL and public publishable/anon key

## Environment

Copy the example file for local development:

```bash
cp .env.example .env.local
```

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Public Supabase project URL used by Supabase Auth. |
| `VITE_SUPABASE_ANON_KEY` | Public publishable/anon key. This is not a service-role secret. |
| `VITE_API_BASE_URL` | API prefix. Use `/api` locally and the Render HTTPS URL ending in `/api` in production. |
| `API_PROXY_TARGET` | Local Vite proxy target, normally `http://127.0.0.1:8000`. |

Production builds reject missing or non-HTTPS Supabase/API URLs. Never place database credentials or a Supabase service-role key in frontend variables.

## Setup and commands

Run from `frontend/`:

```bash
npm install
npm run dev
npm test
npm run lint
npx tsc -b --pretty false
npm run build
npm run preview
```

`npm run build` also performs a TypeScript project build before producing `dist/`.

## Source architecture

```text
src/
├── api/          # Authenticated HTTP client, response mapping, and planner API
├── auth/         # Supabase session, login, signup, confirmation, and recovery UI
├── components/   # Dashboard, calendar, review, settings, tasks, layout, and UI
├── data/         # Default categories, weekday slogans, and seven themes
├── hooks/        # Planner coordination and current-date rollover
├── lib/          # Environment validation and Supabase client
├── types/        # Planner domain and navigation types
├── utils/        # Scoring, scheduling, transitions, validation, time zones, and storage
├── App.tsx       # Navigation, task actions, warnings, and modal orchestration
└── main.tsx      # Auth, API, and application provider composition
```

`AuthProvider` owns the Supabase session. `ApiProvider` converts that session into authenticated API requests. `usePlanner` loads account data from the server, applies successful mutations locally, refreshes activity history, and resets account-scoped state when the authenticated user changes.

The API client retries one `401` response after a shared token refresh, cancels stale requests during account changes, and signs out when authentication cannot be recovered.

## Authentication

Implemented flows include:

- Email/password signup with confirmation email
- Confirmation-pending state and confirmation resend
- Email/password sign-in
- Persisted session restoration and automatic token refresh
- Generic forgot-password response to reduce account enumeration
- `PASSWORD_RECOVERY` callback handling and secure password update form
- Clear handling for successful, expired, and invalid callback links
- Local logout with visible error reporting

Confirmation and recovery redirects are based on `window.location.origin`. The matching production and local URLs must be allow-listed in Supabase.

## Planner features

- Today dashboard with categorized active tasks, Completed and Incomplete outcome sections, live clock, time remaining, points, and separate streaks
- Calendar and Review Plan views with overnight/multi-day intersections, chronological allocation, merged overlaps, and free ranges
- Task creation and editing with category, schedule, automatically calculated duration, importance, and reminder preferences
- Duplicate-name and overlap warnings with explicit “save anyway” confirmation
- Complete, 50% Partial toggle, Incomplete confirmation, and status correction
- One-hour rescheduling cutoff enforced by both frontend and backend
- Custom category creation and automatic creation of missing default categories
- Seven weekday themes, manual theme selection, and collapsible desktop navigation
- User-confirmed import of version 1 or 2 browser planner data

## Scoring, outcomes, and streaks

```text
maxPoints = max(1, plannedMinutes / 60)
earnedPoints = maxPoints × min(actualCompletedMinutes, plannedMinutes) / plannedMinutes
```

- **Pending:** zero completed minutes and points.
- **Partial:** exactly 50% of planned minutes and points. It remains active until its scheduled end, then is displayed in Completed as “Partially Completed” without becoming fully completed.
- **Completed:** 100% progress and full points. Eligible completions create a UTC completion event.
- **Incomplete:** zero progress and points after explicit confirmation.

The activity streak records explicit planning actions or confirmation of today's review. The completion streak requires at least one fully completed, non-future task. Partial and Incomplete outcomes do not qualify. Reopening or deleting a completed task removes its task-linked completion event while preserving genuine activity history.

All V1 calendar decisions use `Asia/Kolkata`; scheduled wall-clock values are not shifted based on the device time zone.

## Persistence

- Tasks, categories, settings, activity dates, and completion events are loaded from and saved to PostgreSQL through the FastAPI API.
- Task mutations include the current server `version`; stale writes receive a conflict and trigger a refresh.
- `sessionStorage` key `lets-do.navigation.v1` stores the active view and Review Plan date for the current tab.
- `localStorage` key `lets-do.planner.v1` is retained only as a legacy import source. Import preview and commit do not alter it.
- The optional `lets-do.planner.owner.v1` value is used only to warn when legacy data appears associated with another account.

## Production

The frontend is deployed to Cloudflare Pages at <https://lets-do.pages.dev>. The production API base URL is `https://lets-do-api.onrender.com/api`. Cloudflare copies security headers from `public/_headers` into the production output.

See [../docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) for build settings, environment values, Supabase redirect configuration, and smoke checks.

## Known limitations

- India-only scheduling for V1
- Reminder preferences without notification delivery
- No recurring routines, rest-day streak pausing, cancellation, or overdue automation
- No URL router or shareable view URLs
- Category rename/delete is available in the API but not exposed in the UI
- Backend requests can be delayed by Render free-tier cold starts
- Production confirmation and recovery email delivery awaits a verified sending domain and production SMTP readiness
