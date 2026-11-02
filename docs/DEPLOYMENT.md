# Production Deployment

This document records the approved Let's Do v1 deployment and the manual configuration required to reproduce it. Do not place credentials, tokens, connection strings, or SMTP secrets in this file.

## Production topology

| Component | Platform | Region or URL |
| --- | --- | --- |
| Frontend | Cloudflare Pages | <https://lets-do.pages.dev> |
| Backend | Render | Singapore, <https://lets-do-api.onrender.com> |
| Database and Auth | Supabase | Singapore production project |
| Development Database and Auth | Supabase | Separate Sydney development project |

Production deployments currently use `feat/frontend-integration`. Railway was evaluated but is not part of the deployed architecture. The existing `backend/railway.json` is an unused legacy artifact, not production configuration; removing it is outside this documentation-only change.

## Release order

1. Review and back up the production Supabase project.
2. Apply reviewed Alembic migrations with the migration-owner connection.
3. Verify runtime-role grants and RLS without changing them from the application service.
4. Deploy and health-check the Render API.
5. Configure the Render API URL in Cloudflare Pages and deploy the frontend.
6. Verify Supabase Auth redirect URLs and email configuration.
7. Run the production smoke checklist below.

Never run migrations automatically from the Render application start command. A failed or concurrent deployment must not race schema changes.

## Supabase production

Use the Singapore production project only for production. Keep the Sydney development project, users, keys, and databases separate.

Required database preparation:

- Create the restricted `lets_do_api` login role manually.
- Ensure it is `NOINHERIT`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOREPLICATION`, and `NOBYPASSRLS`.
- Revoke schema creation and grant only schema usage manually.
- Apply Alembic with a distinct privileged `MIGRATION_DATABASE_URL`.
- Configure Render with only the restricted runtime `DATABASE_URL`.
- Confirm planner tables are not owned by `lets_do_api` and have RLS enabled.

The runtime URL must use psycopg-compatible PostgreSQL syntax and encrypted TLS. Production configuration accepts `sslmode=require`, `sslmode=verify-ca`, or `sslmode=verify-full`. Prefer certificate verification when the chosen Supabase connection endpoint and trusted CA configuration support it.

Supabase Auth requirements:

- Keep an active ES256 P-256 signing key so the backend can verify tokens through JWKS.
- Enable email/password signup and email confirmation.
- Set the Site URL to `https://lets-do.pages.dev`.
- Allow the origin-based confirmation and recovery redirects used by the frontend, including:
  - `https://lets-do.pages.dev/?auth=confirmed`
  - `https://lets-do.pages.dev/?auth=recovery`
- Add corresponding localhost URLs only to the development project.
- Never expose a service-role key to the browser or use it for normal API authentication.

Current Resend testing-domain restrictions limit the recipients that confirmation and recovery emails can reach. Public production email readiness is pending a verified sending domain, appropriate DNS records, and production SMTP configuration in Supabase. Re-test signup, resend, and recovery after that change.

## Render backend

Configure the Render web service in Singapore with:

- Root directory: `backend`
- Python version: 3.12, recorded in `.python-version`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Health check path: `/health`

Production environment variables:

| Variable | Value or requirement |
| --- | --- |
| `APP_ENVIRONMENT` | `production` |
| `APP_DEBUG` | `false` |
| `CORS_ALLOWED_ORIGINS` | `https://lets-do.pages.dev` |
| `DATABASE_URL` | Restricted production `lets_do_api` URL with secure `sslmode`. |
| `SUPABASE_URL` | Public Singapore production project URL. |
| `SUPABASE_JWT_AUDIENCE` | `authenticated` unless the Supabase project intentionally differs. |

Do not configure `MIGRATION_DATABASE_URL` on the long-running service unless a separately controlled manual migration operation specifically requires it. Never log environment values.

The free Render tier can suspend an idle service. The first request after suspension may be slow enough to affect login or initial planner loading; subsequent requests should be faster. This is a known operational limitation rather than a frontend scheduling issue.

## Cloudflare Pages frontend

Configure the Pages project with:

- Root directory: `frontend`
- Install: the platform's lockfile-based npm install
- Build command: `npm run build`
- Output directory: `dist`

Production build variables:

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | Public Singapore production Supabase URL. |
| `VITE_SUPABASE_ANON_KEY` | Public production publishable/anon key. |
| `VITE_API_BASE_URL` | `https://lets-do-api.onrender.com/api` |

Do not configure `API_PROXY_TARGET` for production; it is a Vite development-server setting. Vite rejects production API or Supabase URLs that are missing, relative, contain credentials, or do not use HTTPS. Cloudflare publishes the security headers in `frontend/public/_headers`.

## Secrets and role separation

- Keep all `.env` and `.env.*` files out of version control; `.env.example` contains placeholders only.
- Store Render database credentials and Supabase public configuration in platform environment settings.
- Treat the migration connection, runtime database password, SMTP credentials, and any Supabase service-role key as secrets.
- A publishable/anon frontend key is public by design, but it must still belong to the correct environment.
- Do not reuse production users, credentials, or database URLs in development security tests.

## Production smoke checks

The initial production smoke tests have been completed. Repeat these checks after configuration, database, authentication, or deployment changes:

1. `GET https://lets-do-api.onrender.com/health` returns `200` without authentication.
2. `GET /health/database` reports a reachable production database.
3. The Cloudflare frontend loads without environment-configuration errors.
4. Signup, confirmation callback, login, session restoration, logout, password-reset callback, and password update behave as expected for an allowed test recipient.
5. An authenticated user can create a category and task, update its outcome, refresh, and see the same PostgreSQL-backed data.
6. Duplicate and overlap confirmations, rescheduling cutoff, Review Plan, activity history, and settings persist correctly.
7. Invalid or missing API tokens return structured `401` responses.
8. Browser-data import preview and confirmation leave the original `localStorage` payload unchanged.
9. Responses to the Cloudflare origin contain the expected CORS and security headers.

The opt-in automated two-user RLS/API isolation suite has not yet been completed against the designated development project. Follow [../backend/tests/integration/README.md](../backend/tests/integration/README.md); it is intentionally blocked from production targets.

## Rollback and incident notes

- Roll back application deployments through the hosting platforms; do not improvise database downgrades during an incident.
- Review Alembic downgrade behavior and take a database backup before any schema rollback.
- If a credential may have been exposed, rotate it in the owning platform and update only the relevant environment.
- If JWKS retrieval fails, protected endpoints fail closed with `503 authentication_service_unavailable`.
- If the database is unavailable, `/health/database` returns a structured `503` while `/health` can still report process health.
