# YEAR95 — Project Contract

## Product
**YEAR95 — AI Financial Intelligence**

YEAR95 is a multi-user financial intelligence platform whose initial release provides deterministic market analysis and paper-trading signals.

## Non-negotiable invariants
- Paper trading only in the initial release.
- No live order execution.
- The deterministic Decision Engine is authoritative.
- AI is advisory and cannot override side, thresholds, sizing, or execution permission.
- Invalid, stale, or unverified market data fails closed.
- Risk per trade defaults to 0.5% and may never exceed the 1% hard cap.
- Base position notional is 1.5%; notional and risk are separate concepts.
- Minimum risk/reward is 1:2.
- Supabase provides authentication and PostgreSQL persistence.
- Backend is Fastify; frontend is React/Vite; background processing uses a dedicated worker.
- The architecture must remain independent of Vercel runtime, OIDC, AI Gateway, and cron.
- Repository access is owner-scoped from authenticated user identity; RLS is defense in depth.

## Initial scope
1. Authentication.
2. API and web shells.
3. BTCUSDT market data.
4. 1h, 4h and 1d timeframes.
5. Deterministic indicators and decision engine.
6. Risk engine.
7. Paper signals and outcome tracking.
8. Gemini advisory context, after the deterministic core is stable.

## Initial market-data provider
Binance public market data.

## Quality gate
Every implementation PR must keep lint, build and tests green before advancing.
