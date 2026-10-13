# Delivery tracking and acceptance register

This register separates internal YEAR95 work-item identifiers from GitHub pull request numbers. A work item named `PR #008` is not the same as GitHub pull request `#8`, `#34`, or `#36`. Always cite both the approved work-item brief and the GitHub PR that implements it.

## Confirmed mapping

| Work item / capability | GitHub delivery | Status | Acceptance notes |
| --- | --- | --- | --- |
| R-006 — Supabase JWT authentication and API route protection | [PR #24](https://github.com/engineiapt-ops/year95/pull/24) | Merged | Backend validates JWTs and protects application routes. |
| R-007 — Production API shell | [PR #33](https://github.com/engineiapt-ops/year95/pull/33) | Merged | Fastify production shell, health/readiness, HTTP hardening and Docker. |
| PR #008 — Web shell (approved brief) | [PR #36](https://github.com/engineiapt-ops/year95/pull/36) | Code merged; real-auth acceptance pending | Browser Supabase client, login, protected route, dashboard and typed API client are implemented. See [issue #37](https://github.com/engineiapt-ops/year95/issues/37) for the outstanding local Supabase smoke test. |
| Binance Spot market-data adapter | [PR #34](https://github.com/engineiapt-ops/year95/pull/34) | Merged | Public BTCUSDT candle adapter only; market-data HTTP routes, candle persistence and decision workflow were explicitly outside its scope. No internal R identifier is assigned here because an approved brief mapping it to an R item was not found. |

## Identifier correction

The approved work-item brief provided for the web shell is titled `PR #008 — Web shell`; it was delivered by GitHub PR #36. The former `(#008)` suffix on GitHub PR #34's title was ambiguous and has been removed. The GitHub PR numbers themselves remain historical, permanent identifiers.

Do not renumber merged commits or infer an internal R identifier from a GitHub PR title. When another approved work item is supplied, record its exact internal identifier, scope, legacy references, and acceptance criteria here in the same PR that implements or establishes that work.

## Advancement gate

- R-008 (web shell) is not fully accepted until issue #37 contains evidence that sign-in against the disposable local Supabase stack works end to end, including dashboard API health/readiness and authenticated `/v1/me`, logout, and session expiry.
- Automated CI and the bundle secret scan passed for GitHub PR #36, but those checks use deterministic Auth mocks and do not establish that a real local Supabase sign-in was performed.
- The repository does not currently contain an approved specification for R-009. Do not start implementation under that identifier based on guesswork. Once the R-008 smoke test is complete, obtain and register the approved R-009 brief before opening its implementation PR.

## Safety

Run the web-auth smoke test only against a disposable local Supabase instance as described in [LOCAL-WEB-AUTH.md](LOCAL-WEB-AUTH.md). Do not use production Supabase, expose a service-role key or database URL through any `VITE_*` variable, or change the live database as part of this validation.
