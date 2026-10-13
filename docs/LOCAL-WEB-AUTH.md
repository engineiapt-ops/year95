# Local web authentication

The web app uses Supabase Auth directly with the **public anon key only**. A service-role key, database URL, or broker credential must never use a `VITE_` prefix.

## Start the local services

1. Start the local Supabase stack with the Supabase CLI in a project that has a `supabase/config.toml`: `supabase start`.
2. Copy the local API URL and anon key shown by `supabase status`. The URL is normally `http://127.0.0.1:54321`; use the generated `anon` key, not the `service_role` key.
3. In the repository root, copy `.env.example` to an untracked `.env` and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL=http://localhost:3000`, and `CORS_ORIGINS=http://localhost:5173`.
4. Configure and start the API against the same local PostgreSQL/Supabase database. Bootstrap only that local database with the documented baseline/migration process. Never point this setup at production to make the demo work.
5. Sign in with an email/password user created in the local Supabase Auth instance. The protected `/v1/me` endpoint also checks the backend database allowlist, so the test account must be allowlisted in the local database.
6. Run `pnpm --filter @year95/web dev` and open `http://localhost:5173`.

The app does not implement public registration. Create test users through the local Supabase dashboard or CLI.

## Validation

- `pnpm --filter @year95/web typecheck`
- `pnpm --filter @year95/web build` (includes the bundle secret scan)
- `pnpm test:component`
- `pnpm --filter @year95/web test` is not required; the API client unit tests run through `pnpm test:unit`.

Component tests use an injected Auth client and stay deterministic in CI without requiring a running Supabase stack. CI does not claim to have authenticated against a live local Supabase instance.
