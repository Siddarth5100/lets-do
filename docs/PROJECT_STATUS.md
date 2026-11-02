# Project Status and Handover

This document is the concise handover for Let's Do v1. Keep it current whenever completed, pending, deferred, or architectural work changes.

## Status summary

Let's Do v1 is implemented as an authenticated, PostgreSQL-backed planner. The frontend, API, database schema, Supabase authentication, legacy-data import, deployment configuration, and production smoke path are complete. Production currently runs from `feat/frontend-integration`.

Production:

- Cloudflare Pages frontend: <https://lets-do.pages.dev>
- Render Singapore API: <https://lets-do-api.onrender.com>
- Supabase Singapore: production PostgreSQL and Auth
- Supabase Sydney: development PostgreSQL and Auth

## Completed

### Product

- Responsive Today, Calendar, Review Plan, and Settings views
- Task scheduling, overnight/multi-day availability, overlap and duplicate warnings
- Pending, 50% Partial, Completed, Incomplete, correction, deletion, and importance actions
- One-hour rescheduling cutoff with save-time enforcement
- Duration-weighted points and separate activity/completion streaks
- Custom category creation, seven themes, responsive navigation, and live dashboard time
- User-confirmed preview and import of supported legacy browser data

### Authentication and frontend integration

- Supabase email/password signup and confirmation
- Confirmation resend, login, persisted sessions, token refresh, and logout
- Forgot-password and `PASSWORD_RECOVERY` password update flow
- Clear invalid and expired callback handling
- Authenticated API client with one refresh retry, stale-request cancellation, and account switching
- PostgreSQL-backed planner bootstrap and mutation updates

### Backend and data

- FastAPI application, structured errors, public process/database health endpoints, and exact-origin CORS
- ES256 Supabase JWT/JWKS verification with required claims and fail-closed errors
- Authenticated task, category, settings, activity, review, and legacy-import APIs
- Five-table PostgreSQL schema with constraints, indexes, Supabase ownership, and Alembic migrations
- Restricted `lets_do_api` runtime role grants and per-user RLS policies
- Transaction-local `app.current_user_id` derived from the verified token UUID
- Optimistic task concurrency through a server version column
- Separate privileged migration and restricted runtime connections
- India-only `Asia/Kolkata` scheduling with UTC event timestamps

### Quality and deployment

- Backend unit/API/model/migration tests and frontend component/business-logic tests
- Opt-in, fail-closed live Supabase security suite using two disposable development users
- Reproducible Python 3.12 production dependency lock
- Production environment, HTTPS API URL, PostgreSQL TLS, and CORS validation
- Cloudflare security headers
- Production smoke tests completed

## Required before public launch

1. Complete production email readiness:
   - verify the Resend sending domain and DNS records;
   - configure production SMTP in Supabase;
   - re-test confirmation, resend, and recovery beyond testing-domain recipient restrictions.
2. Run the opt-in automated multi-user isolation suite against the Sydney development project with disposable users, then remove those users.
3. Reconfirm production runtime-role ownership, grants, transaction-local identity, and RLS policy state with read-only audits.
4. Review Render free-tier cold-start behavior against acceptable login and initial-load latency.
5. Decide when production deployment should move from `feat/frontend-integration` to a stable release branch.
6. Remove the unused `backend/railway.json` artifact in a separately approved non-documentation cleanup; production uses Render.

Do not run the live security suite against production and do not reuse real accounts.

## Deferred beyond v1

- Multi-time-zone account support
- Real reminder/notification delivery
- Recurring routines
- Rest days that pause streaks
- Overdue automation and task cancellation
- URL routing and shareable planner views
- Frontend category rename/delete management
- Broader performance profiling and optional bundle splitting

## Important decisions

- **Authoritative data:** PostgreSQL owns planner data. Browser `localStorage` is only a preserved legacy import source; `sessionStorage` stores navigation for one tab.
- **Authentication:** Supabase Auth issues user tokens; the backend verifies ES256 signatures through public JWKS. No service-role key is used by the frontend or normal API authentication.
- **Isolation:** FastAPI performs explicit owner filtering and sets the verified UUID as transaction-local PostgreSQL state. RLS is defense in depth and the runtime role cannot bypass it.
- **Database roles:** Alembic uses a privileged migration connection. FastAPI uses only `lets_do_api`, which does not own planner tables or create schema objects.
- **Concurrency:** Every task mutation uses the current version so concurrent changes fail rather than silently overwrite data.
- **Time:** V1 accepts only `Asia/Kolkata` for new schedules and calendar rules. Stored schedule wall times are preserved; event timestamps are UTC-aware. Time-zone columns remain for future compatibility.
- **Scoring:** Every completed task is worth at least one maximum point; tasks longer than one hour scale by duration. Partial is exactly 50% for v1.
- **Capacity:** There is no fixed daily capacity setting. Planned time is derived from tasks and never restricts scheduling.
- **Conflicts:** Duplicate names and overlapping tasks warn but may proceed after explicit confirmation.
- **Rescheduling:** Schedule changes are permitted only before one hour prior to the original start and are checked again at save time.
- **Import:** Legacy imports are explicit, digest-bound, retry-safe, ownership-scoped, and never delete the source or existing server records.
- **Deployment:** Cloudflare Pages hosts React, Render Singapore hosts FastAPI, Supabase Singapore hosts production data/Auth, and Supabase Sydney remains isolated for development.

## Known operational limitations

- Render free-tier cold starts can delay the first backend request after inactivity.
- Resend's testing-domain restrictions prevent general production email delivery until a domain is verified.
- The live automated multi-user isolation suite is implemented but its designated development run is pending.
- There is no repository-managed deployment pipeline beyond the hosting-platform configuration; current production deployments use `feat/frontend-integration`.

## Handover references

- [Root overview](../README.md)
- [Frontend](../frontend/README.md)
- [Backend and API](../backend/README.md)
- [Deployment](DEPLOYMENT.md)
- [Live security tests](../backend/tests/integration/README.md)
