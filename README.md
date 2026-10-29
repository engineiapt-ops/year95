# YEAR95 — AI Financial Intelligence

YEAR95 is a multi-user financial intelligence platform built around deterministic quantitative analysis and paper-trading signals.

## Repository structure

- apps/api — Fastify API
- apps/web — React/Vite web application
- apps/worker — background processing
- packages/contracts — shared contracts and DTOs
- packages/domain — pure domain model
- packages/quant — deterministic quantitative features
- packages/risk — risk and sizing
- packages/market-data — market-data contracts and adapters
- packages/decision — deterministic decision engine
- packages/paper-trading — paper signal lifecycle
- packages/ai — advisory AI boundary
- packages/persistence — persistence ports and implementations
- packages/evaluation — evaluation and validation
- packages/backtest — backtesting
- packages/research — research services
- packages/portfolio — portfolio logic
- packages/providers — external provider mappings
- packages/config — application configuration

## Project contract

The normative project contract is documented before runtime implementation:

- Project Contract: docs/PROJECT-CONTRACT.md
- Migration Matrix: docs/MIGRATION-MATRIX.md
- Behavior Contracts: docs/BEHAVIOR-CONTRACTS.md
- Architecture Decision Records: docs/adr/

These documents define the non-negotiable guardrails for subsequent PRs.

## Foundation

YEAR95 is a pnpm monorepo targeting Node 22 with TypeScript strict mode. Domain logic remains independent of HTTP, PostgreSQL and external provider details.

## API runtime

Build the API and its workspace dependencies with pnpm --filter @year95/api build, then run it with pnpm --filter @year95/api start.

- GET /health is a liveness endpoint and does not require database credentials.
- GET /ready performs a PostgreSQL `SELECT 1` through the shared connection pool and returns HTTP 503 when the database is missing or the check fails.
- Configure `DATABASE_URL` only in the server environment. Connections verify the TLS certificate by default. When using the Supabase pooler, follow [docs/DEPLOY-DB.md](docs/DEPLOY-DB.md) to configure the Supabase CA. `/health` remains independent of database readiness.
- This runtime currently exposes health/readiness only. Authentication-protected application endpoints, user-scoped repositories and business workflows remain outside this PR.

## Configuration

Runtime configuration is injected at application boundaries. Secrets are never committed. The configuration boundary must remain deterministic and testable.

## Legacy

The legacy ai-financial-analyst repository is reference-only. Its behavior and schema are used to recover contracts and golden values; legacy code is not copied in bulk into YEAR95.

## Current status

YEAR95 is being implemented incrementally from the approved project contract. Each PR is limited to its declared scope.

## API shell and Docker

The API is built through the injectable `buildApp(options)` factory in `apps/api/src/app.ts`. Existing `createApiApp` imports remain supported. The HTTP shell provides:

- `GET /health` for liveness without a database dependency.
- `GET /ready` for PostgreSQL readiness, returning `503` on failure.
- Versioned routes beneath `/v1`.
- Exact-origin CORS allowlisting through `CORS_ORIGINS`; an empty allowlist denies browser origins.
- Standard and heavy per-client limits of `RATE_LIMIT_MAX` (default 120/minute) and `RATE_LIMIT_HEAVY_MAX` (default 20/minute). Heavy routes declare `config: { rateLimit: 'heavy' }` and are subject to both limits.
- Opaque `x-request-id` response identifiers, redacted structured Pino logs and a shared HTTP error envelope.
- Graceful `SIGINT`/`SIGTERM` shutdown that closes the Fastify server and PostgreSQL pool.

The in-memory rate limiter is local to each API process; multi-replica shared limits are not part of this shell PR.

Build the API image from the repository root:

```sh
docker build -f apps/api/Dockerfile -t year95-api:local .
docker run --rm -p 3000:3000 -e DATABASE_URL="$DATABASE_URL" -e CORS_ORIGINS="http://localhost:5173" year95-api:local
```

The `API Docker` GitHub Actions workflow builds the image for API-related pull requests.

## Binance REST market-data provider

`@year95/providers` exports `BinancePriceProvider`, which implements the provider-neutral `PriceProvider` contract from `@year95/contracts`. It uses the injected `BINANCE_BASE_URL` from application configuration and the public Binance Spot `/api/v3/klines` endpoint. It does not read `process.env` during module import and requires no Binance credentials. The existing `BinanceSpotProvider` API remains available for the current market-data snapshot contract.

- The initial verified mapping supports `BTCUSDT` and timeframes `1h`, `4h`, and `1d` only.
- Numeric fields and timestamps are parsed safely. Invalid OHLCV, malformed responses, duplicate candles, unsupported symbols/timeframes, and timestamps outside JavaScript's valid `Date` range fail closed.
- Candles whose `closeTime` is in the future are discarded. `getHistory` pages backward in requests capped at 1,000 rows and returns closed candles chronologically.
- Network/timeouts and transient HTTP statuses (408, 425, 429, and 5xx) receive bounded retries with exponential full jitter. Non-transient HTTP errors fail immediately. Retry count, delays, randomness, sleeping, transport, clock, base URL, and timeout can be injected for deterministic tests.
- A reusable `PriceProvider` contract suite validates candle shape, closure, order, and history bounds using a recorded JSON fixture. CI never contacts the real Binance service.

This PR does not add WebSocket streaming, persistence, migrations, ingestion scheduling, HTTP market-data routes, decisions, or paper trades. Those remain separately scoped work.
