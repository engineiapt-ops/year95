# YEAR95 — Migration Matrix

Delivery 1 is contract-first. This matrix defines how the initial legacy sources are treated before implementation begins.

| Legacy source | Classification | YEAR95 treatment | Guardrail |
|---|---|---|---|
| `docs/ARCHITECTURE.md` | REFERENCE | Extract architecture, boundaries, invariants and dependency direction into YEAR95 documentation. | No bulk code copy. |
| `db/schema.sql` | KEEP | Preserve the underlying Supabase/PostgreSQL data model and historical semantics; domain naming is translated only in `packages/persistence`. | Existing baseline remains immutable. |
| `src/risk/` | REBUILD | Reimplement risk behavior behind the new domain/application boundaries. | Preserve hard risk cap and fail-closed semantics; use new sizing names. |
| `src/quant/` | REBUILD | Reimplement quantitative primitives as pure domain-independent packages. | Preserve golden values where behavior is intentionally retained. |
| `src/marketdata/quality.ts` | REBUILD | Reimplement market-data freshness and closed-candle validation behind the new market-data contract. | Stale data and invalid data fail closed. |
| `src/jev/` | DROP | Do not carry the JEV runtime dependency into the initial YEAR95 core. | Deterministic quantitative decision remains authoritative. |
| `src/options/` | REFERENCE | Keep as historical reference only until separately scoped. | Not part of Delivery 1. |
| `src/broker/` | REFERENCE | Keep only as historical reference for read-only account boundaries. | No live order path. |
| Other legacy runtime code | REFERENCE | Rebuild only when a later PR explicitly scopes the behavior. | No opportunistic migration in Delivery 1. |

## Classification definitions

**KEEP** means preserve the relevant data/schema semantics, not copy legacy application code wholesale.

**REBUILD** means recreate the behavior in the YEAR95 architecture with new domain-oriented contracts.

**REFERENCE** means use the legacy source for behavior discovery only.

**DROP** means the behavior is intentionally excluded from the initial product scope.

## Delivery 1 boundary

This document does not migrate runtime code, change `package.json`, add CI or alter the database. It establishes the migration decision record that later implementation PRs must follow.
