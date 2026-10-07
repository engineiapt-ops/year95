# YEAR95 — Database Baseline & Safety Gate

## Purpose

This document records the database evidence available before YEAR95 repository design.

The rule is explicit: the real Supabase/Postgres database must be inspected read-only before YEAR95 persistence interfaces or migrations are designed.

## Source baseline audited

Reference repository:

- `engineiapt-ops/ai-financial-analyst`
- audited head: `e539b1583276c40b6793986d947134e82921ca74`
- approximately 300 versioned files
- 23 SQL migrations
- approximately 239 files under `src`

The source audit already identified that the legacy repository is functionally rich but contains historical paths, compatibility facades and responsibilities crossing boundaries. YEAR95 therefore uses selective reconstruction rather than copying the legacy implementation.

## Source schema observations

The legacy `db/schema.sql` contains these major persistence areas:

| Area | Legacy shape | YEAR95 treatment |
|---|---|---|
| market_data | OHLCV plus derived indicator columns and unique scope/time key | Rebuild source-candle storage with provenance; derived indicators remain runtime calculations |
| signals | recommendation, sizing, JEV fields and execution metadata | Rebuild around deterministic decision/paper-signal contracts; JEV excluded from MVP |
| paper_trades | paper lifecycle, PnL, fees, slippage and exit state | Preserve behavior selectively with owner scoping |
| config | user-scoped preferences, including legacy 2% fixed sizing | Replace with explicit YEAR95 risk/sizing policy |
| logs | component-level operational messages | Rebuild as infrastructure concern, not domain state |
| decision_log | decision audit and pending/settled outcome fields | Rebuild only the required immutable audit/evaluation concepts |
| backtest / walk-forward / portfolio | validation and research persistence | Later phase; not part of initial persistence surface |
| research / audit snapshots | immutable evidence records | Preserve only after contracts are defined |

## Important legacy constraints to preserve

The legacy source contains evidence of:

- restricted direct Data API grants in migration `019_revoke_public_data_api_grants.sql`;
- research-snapshot type alignment in migration `018_align_research_snapshot_decision_log_type.sql`;
- paper decision idempotency keyed by asset, timeframe, data timestamp and origin in migration `021_decision_log_paper_idempotency.sql`;
- immutable audit/snapshot patterns in later database objects.

These are reference behaviors, not instructions to copy legacy SQL verbatim.

## Risks identified before YEAR95 persistence design

1. `market_data` mixes source OHLCV with derived indicators. This can produce persisted calculations that diverge from runtime logic.
2. `signals` and `decision_log` overlap in decision history and outcome information.
3. Legacy `config` contains a fixed 2% position sizing default that conflicts with YEAR95 D2.
4. Several legacy objects are not designed around authenticated multi-user ownership.
5. Multiple later tables are tied to backtesting, research and governance concerns that are outside the first milestone.

## Real database comparison status

**BLOCKED — real Supabase project is not currently available through the connected Supabase integration.**

No YEAR95 migration is being created from assumptions.

No repository interface is being treated as finalized.

No destructive or corrective SQL is being executed.

## Gate to unblock persistence design

Before PR #005 (persistence implementation), capture read-only evidence from the actual Supabase/Postgres environment:

1. reachable project/database identity;
2. installed relations and relevant columns;
3. existing constraints and indexes;
4. RLS policies and grants;
5. migration history, if tracked by the environment;
6. differences between real state and the legacy reference.

The result must be recorded before any schema mutation.

## Safety rule

Until the gate above is complete, YEAR95 only has structural and pure TypeScript foundations. Database behavior is not copied from the legacy application by default.
