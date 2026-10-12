# YEAR95 — Architecture Decisions

## D1 — JEV
JEV is excluded from MVP. It may return later as an optional, audited SignalSource and is never authoritative.

## D2 — Sizing semantics
- positionNotionalPct: 1.5% base
- riskPerTradePct: 0.5% default
- hard maximum risk: 1%
- dynamic sizing cannot bypass the hard cap

## D3 — HTTP
Fastify.

## D4 — Identity
Multi-user from day one. Initial access may be closed/allowlisted. Supabase Auth is the identity provider.

## D5 — Repository
YEAR95 is a new repository. The legacy ai-financial-analyst repository is reference-only.

## D6 — Legacy baseline
Before treating the legacy baseline as authoritative, capture npm ci, lint, build and the complete test result.

## D7 — Database safety (ADR-0007)
Keep Supabase/Postgres. Compare tracked schema, migrations and the real database read-only before designing repositories. No destructive migrations; additive changes only.
- db/baseline/schema.sql is the canonical final schema for blank-database bootstrap.
- Historical migrations 001–023 remain content-preserved and SHA-256 tracked; they are recorded as baseline history but are not re-executed against the final schema.
- An existing database is never bootstrapped. Missing baseline metadata is recorded only after a supplied comparator proves structural equivalence for tables/views, columns, constraints, indexes, triggers and trigger functions.
- db/migrations/024+ is forward-only and additive. pnpm check:migrations scans only this directory and intentionally excludes the immutable baseline archive.
- The optional live Supabase comparison uses a read-only connection and catalog SELECTs only. PR #17 corrected the canonical schema and passed CI without live database writes.
- Migration 024 adds the provider-neutral instruments registry; migration 025 restores the historical partial unique paper-idempotency index. Both are additive and idempotent. A narrowly scoped legacy bridge may apply 024 and 025 atomically only when the old filename ledger matches migrations 001–018 exactly, instruments and the named idempotency index are both absent, and the read-only fingerprint matches canonical state after excluding only those two known objects. The full canonical fingerprint must pass before the legacy ledger is upgraded. Unknown history, either object already present, or any other schema drift fails closed. Live Supabase data is never changed by CI.
## D8 — Authorization
JWT userId flows through services into owner-scoped repositories. RLS is defense in depth, not the sole authorization boundary. Migration 026 enables RLS on every public table, including the application migration ledger, and deliberately adds no client policies or grants; direct `anon` and `authenticated` table access remains default-deny. Database-owner/backend connections retain their existing server-side path. Immutable audit trigger functions pin `search_path` to `pg_catalog` because they use only `RAISE EXCEPTION` and no application objects. The structural fingerprint normalizes only this exact runtime configuration clause in `pg_get_functiondef()`; tests assert the configured value separately.

## D9 — Infrastructure independence
No Vercel OIDC, AI Gateway, Vercel runtime dependency or Vercel cron.

## D10 — First milestone
Login → API → Supabase → UI → BTCUSDT → market data → analysis → risk → paper signal.
 
 
## D11 — PostgreSQL repositories 
Repository contracts live in packages/contracts and PostgreSQL implementations live only in packages/persistence. Persistence maps legacy Portuguese column names to English domain fields. The database pool is configured through explicit dependency injection, uses TLS and bounded timeouts/connections, and transaction-mode compatible queries without named prepared statements. 

## D12 — Supabase JWT authentication
The API validates Supabase access tokens using jose and the project's remote JWKS, with cached keys, explicit issuer/audience validation, and bounded clock tolerance. Every route is protected by default except `/health` and `/ready`. The verified subject and email are attached to the request only after the server-side email allowlist approves the identity. Missing/invalid credentials return the contracts-standard 401, allowlist denial returns 403, and allowlist infrastructure failure fails closed with 503. Static API auth tokens are not supported.
