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
- The optional live Supabase comparison uses a read-only connection and catalog SELECTs only. This PR performs no live database writes.
## D8 — Authorization
JWT userId flows through services into owner-scoped repositories. RLS is defense in depth, not the sole authorization boundary.

## D9 — Infrastructure independence
No Vercel OIDC, AI Gateway, Vercel runtime dependency or Vercel cron.

## D10 — First milestone
Login → API → Supabase → UI → BTCUSDT → market data → analysis → risk → paper signal.
