# Local web authentication

The repository includes `supabase/config.toml` for a disposable local Supabase stack. The web app uses Supabase Auth directly with the **public anon key only**. A service-role key, database URL, or broker credential must never use a `VITE_` prefix.

## Start the local services

Prerequisites: Docker and the Supabase CLI.

1. From the repository root, run `supabase start`. The local Auth/API endpoint is normally `http://127.0.0.1:54321`, PostgreSQL is `127.0.0.1:54322`, and Studio is `http://127.0.0.1:54323`.
2. Run `supabase status` and copy the local **anon** key. Never copy the `service_role` key into a Vite variable.
3. Copy `.env.example` to an untracked root `.env` and set `VITE_SUPABASE_URL=http://127.0.0.1:54321`, `VITE_SUPABASE_ANON_KEY=<local anon key>`, and `VITE_API_BASE_URL=http://localhost:3000`.
4. In a terminal for the local database, set `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres` and `DB_BASELINE_DISPOSABLE=1`, then run `pnpm db:baseline`. Unset `DB_BASELINE_DISPOSABLE` after it succeeds and run `pnpm --filter @year95/persistence migrate` to apply the repository's forward-only migrations to this disposable local database. **Do not use a production URL.**
5. Add the test account email to the local allowlist, for example with `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "INSERT INTO public.allowed_emails(email) VALUES ('trader@example.test') ON CONFLICT (email) DO NOTHING;"`.
6. In Supabase Studio, create an email/password user whose email matches the allowlist entry. Public signup remains disabled in local config, mirroring the product's closed-registration policy.
7. In a separate terminal, set `NODE_ENV=development`, `PORT=3000`, the same local `DATABASE_URL`, `SUPABASE_URL=http://127.0.0.1:54321`, and `CORS_ORIGINS=http://localhost:5173`. Then run `pnpm --filter @year95/api build` and `pnpm --filter @year95/api start`.
8. Start the web app with `pnpm --filter @year95/web dev` and open `http://localhost:5173`. Sign in with the test user. The dashboard calls the API's `/health`, `/ready`, and authenticated `/v1/me` endpoint.

The app does not implement public registration. User creation, allowlisting, database bootstrap, and all keys in this guide are for the local development stack only.

## Automated validation

- `pnpm --filter @year95/web typecheck`
- `pnpm --filter @year95/web build` (includes the bundle secret scan)
- `pnpm test:component`
- `pnpm test:unit`

Component tests inject a deterministic Auth client; the client tests validate JWT attachment and session expiry. The bundle scanner has unit tests for rejecting backend secret markers, service-role JWTs, and non-anon JWTs. CI does not claim it started the Supabase Docker stack or completed the manual local sign-in flow.
