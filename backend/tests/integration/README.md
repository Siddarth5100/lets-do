# Supabase security integration tests

This opt-in suite verifies the development Supabase project through the restricted
`lets_do_api` database role and a locally running Let's Do API. It never uses a
service-role key, changes database permissions, or commits direct database probes.

Create two confirmed, disposable users in the development Supabase project. Do not
reuse personal or production accounts. Start the local API with its development
Supabase and runtime database configuration, then provide these variables in the
shell that runs pytest:

```text
RUN_SUPABASE_SECURITY_TESTS=1
SECURITY_TEST_ENVIRONMENT=development
SECURITY_TEST_EXPECTED_PROJECT_REF=<development project reference>
SECURITY_TEST_SUPABASE_URL=<development Supabase URL>
SECURITY_TEST_SUPABASE_PUBLISHABLE_KEY=<publishable key>
SECURITY_TEST_DATABASE_URL=<lets_do_api runtime URL>
SECURITY_TEST_API_URL=http://127.0.0.1:8000
SECURITY_TEST_USER_A_EMAIL=<disposable user A email>
SECURITY_TEST_USER_A_PASSWORD=<disposable user A password>
SECURITY_TEST_USER_B_EMAIL=<disposable user B email>
SECURITY_TEST_USER_B_PASSWORD=<disposable user B password>
SECURITY_TEST_CONFIRM_DISPOSABLE_USERS=1
```

Run only the live suite from `backend/`:

```bash
.venv/bin/pytest -m supabase_security
```

The suite validates that the Supabase URL and runtime database URL identify the
explicit expected project before authenticating or creating records. The API URL
must be loopback-only. Test tasks and categories are uniquely named and removed,
and previous settings are restored. Activity records created by normal API actions
can remain on the disposable accounts, so delete those accounts after verification.
Never paste test configuration or command output containing secrets into reports.
