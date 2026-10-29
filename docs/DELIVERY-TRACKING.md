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

GitHub delivery: [PR #34](https://github.com/engineiapt-ops/year95/pull/34). Status: merged. This is a public BTCUSDT candle adapter only; market-data HTTP routes, candle persistence and decision workflow were explicitly outside its scope.

## R-009 — Closed-candle persistence and retrieval

**Approved scope:** connect the existing provider-neutral market-candle contract to PostgreSQL persistence for verified BTCUSDT candles on `1h`, `4h`, and `1d` only. Persist only validated, closed candles; require an explicit validated provider/instrument approval from the shared market-data contract before writes and reads; support idempotent writes and chronological reads scoped to the approved provider. Keep legacy Portuguese column names inside the persistence adapter.

**Out of scope:** HTTP endpoints, scheduling/background workers, decision-workflow integration, strategies, indicators, backtesting, and order execution. The shared validation contract must be required by any future quantitative decision entrypoint; no decision workflow currently exists to wire in this PR.

**Acceptance criteria:**

- Forward-only additive migration `030_market_data_closed_candles.sql`; immutable `db/baseline/001–023`.
- Historical rows are preserved and are not assigned guessed close times or providers.
- Invalid, future-closing, duplicate, unsupported-symbol, unsupported-timeframe, unregistered-provider, disabled-provider, or unvalidated provider/instrument pairs fail closed before database access.
- Reads are scoped to the explicitly requested validated provider; provider-neutral persistence contains no provider-specific implementation.
- SQL values are parameterized; read limits are bounded; queries exclude rows with unknown close times.
- Unit tests cover validation, idempotent SQL shape, and retrieval mapping; CI must pass before merge.
- No production database migration is run by this PR.

GitHub delivery: implementation PR opened from this brief; acceptance is pending CI and review.

## PR #011 — Market-data contracts and quality

Approved scope is implemented in [GitHub PR #53](https://github.com/engineiapt-ops/year95/pull/53); acceptance remains pending CI/review.

- `packages/contracts/src/market-data.ts` defines provider-neutral `PriceProvider`, `CandleRepository`, and `ProvenanceRecord` contracts.
- `packages/market-data` normalizes closed candles, validates OHLCV, sorts chronologically, detects gaps, discards forming candles, and applies the legacy 1.5× timeframe freshness threshold. Quality functions take an explicit timestamp; no direct wall-clock read is used.
- Tests cover the 1h/4h/1d freshness boundaries, empty/future/stale data, forming candles, gaps, invalid OHLCV, and duplicate behavior.
- **Declared legacy behavior change:** legacy normalization rejected all duplicate open times. This PR deduplicates exact duplicate records but rejects the entire batch when records sharing an open time differ in close time or OHLCV.
- No Binance adapter, SQL, migration, HTTP route, or decision-flow changes are included.

## Identifier correction

The approved work-item brief provided for the web shell is titled `PR #008 — Web shell`; it was delivered by GitHub PR #36. The former `(#008)` suffix on GitHub PR #34's title was ambiguous and has been removed. The GitHub PR numbers themselves remain historical, permanent identifiers.

## Advancement gate

- R-008 (web shell) is accepted: issue #37 is closed after successful real-auth evidence on PR #40. The disposable local Supabase flow verified sign-in, API JWT verification, dashboard health/readiness and authenticated `/v1/me`, session-expiry handling, logout, and browser secret safety.
- Validation on PR #40 head `80db5ff9918ec4dff73037685e2751a5d827851e`: [CI](https://github.com/engineiapt-ops/year95/actions/runs/38648343189), [Local Supabase Auth Smoke](https://github.com/engineiapt-ops/year95/actions/runs/38648343217), and [API Docker](https://github.com/engineiapt-ops/year95/actions/runs/38648343167) all passed.

## Safety

Run the web-auth smoke test only against a disposable local Supabase instance as described in [LOCAL-WEB-AUTH.md](LOCAL-WEB-AUTH.md). Do not use production Supabase, expose a service-role key or database URL through any `VITE_*` variable, or change the live database as part of this validation.
