# Delivery tracking and acceptance register

This register separates internal YEAR95 work-item identifiers from GitHub pull request numbers. A work item named `PR #008` is not the same as GitHub pull request `#8`, `#34`, or `#36`. Always cite both the approved work-item brief and the GitHub PR that implements it.

## Confirmed mapping

### R-006 — Supabase JWT authentication and API route protection

GitHub delivery: [PR #24](https://github.com/engineiapt-ops/year95/pull/24). Status: merged. The backend validates JWTs and protects application routes.

### R-007 — Production API shell

GitHub delivery: [PR #33](https://github.com/engineiapt-ops/year95/pull/33). Status: merged. Includes the Fastify production shell, health/readiness, HTTP hardening and Docker.

### PR #008 — Web shell (approved brief)

GitHub delivery: [PR #36](https://github.com/engineiapt-ops/year95/pull/36). Code is merged. Real-auth acceptance was completed by [PR #40](https://github.com/engineiapt-ops/year95/pull/40), merged at `1d6cbaddbae08863c6355d6f5aae2dabbff8b895`. The browser Supabase client, login, protected route, dashboard and typed API client are implemented. The local Supabase Auth smoke test and required CI/Docker workflows passed on PR #40 head `80db5ff9918ec4dff73037685e2751a5d827851e`; see [issue #37](https://github.com/engineiapt-ops/year95/issues/37) for the recorded evidence.

### Binance Spot market-data adapter

GitHub delivery: [PR #34](https://github.com/engineiapt-ops/year95/pull/34). Status: merged. This is a public BTCUSDT candle adapter only; market-data HTTP routes, candle persistence and decision workflow were explicitly outside its scope. No internal R identifier is assigned here because an approved brief mapping it to an R item was not found.

## Identifier correction

The approved work-item brief provided for the web shell is titled `PR #008 — Web shell`; it was delivered by GitHub PR #36. The former `(#008)` suffix on GitHub PR #34's title was ambiguous and has been removed. The GitHub PR numbers themselves remain historical, permanent identifiers.

Do not renumber merged commits or infer an internal R identifier from a GitHub PR title. When another approved work item is supplied, record its exact internal identifier, scope, legacy references, and acceptance criteria here in the same PR that implements or establishes that work.

## Advancement gate

- R-008 (web shell) is accepted: issue #37 is closed after successful real-auth evidence on PR #40. The disposable local Supabase flow verified sign-in, API JWT verification, dashboard health/readiness and authenticated `/v1/me`, session-expiry handling, logout, and browser secret safety.
- Validation on PR #40 head `80db5ff9918ec4dff73037685e2751a5d827851e`: [CI](https://github.com/engineiapt-ops/year95/actions/runs/38648343189), [Local Supabase Auth Smoke](https://github.com/engineiapt-ops/year95/actions/runs/38648343217), and [API Docker](https://github.com/engineiapt-ops/year95/actions/runs/38648343167) all passed.
- The repository does not currently contain an approved specification for R-009. Do not start implementation under that identifier based on guesswork. Once the R-008 smoke test is complete, obtain and register the approved R-009 brief before opening its implementation PR.

## Safety

Run the web-auth smoke test only against a disposable local Supabase instance as described in [LOCAL-WEB-AUTH.md](LOCAL-WEB-AUTH.md). Do not use production Supabase, expose a service-role key or database URL through any `VITE_*` variable, or change the live database as part of this validation.
