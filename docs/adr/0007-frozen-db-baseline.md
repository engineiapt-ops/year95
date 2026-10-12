# ADR-0007 — Frozen Database Baseline (D6)

- **Status:** Accepted
- **Date:** 2026-10-13
- **Scope:** database baseline, migration history and read-only comparison; this ADR does not authorize production changes.

## Decision

The repository's canonical blank-database schema is `db/baseline/schema.sql`. Historical migrations 001–023 are retained as immutable baseline evidence with SHA-256 checksums; they are not replayed over a database that already represents the final schema. Forward migrations are additive and live in `db/migrations/024+`.

An existing database must never be bootstrapped or modified merely because baseline metadata is missing. The baseline runner must fail closed unless an explicit comparator establishes structural equivalence across tables/views, columns, constraints, indexes, triggers and trigger functions. Recognized legacy upgrades are narrowly allowlisted and must pass the complete canonical fingerprint before the migration ledger is updated.

The optional live Supabase comparison is strictly read-only: it performs catalog SELECTs, requires the dedicated `SUPABASE_READONLY_DATABASE_URL` connection, and must be reviewed before any schema change is proposed. A discovered divergence is reported without remediation; the maintainer decides the next step separately. No live database comparison, migration or write is implied by this ADR.

Before relying on the legacy baseline as authoritative, preserve the outcome of `npm ci`, lint, build and the full test suite at the cited legacy commit. Legacy implementation files are evidence only and are not copied wholesale into YEAR95.

The recognized legacy bridge is narrowly scoped: migrations 024 and 025 may be applied atomically only when the legacy ledger contains exactly migrations 001–018, both `instruments` and `idx_decision_log_paper_idempotency` are absent, and a read-only structural fingerprint matches the canonical schema after excluding only those two objects. The full canonical fingerprint must match after the upgrade before the migration ledger is updated. Any other ledger state, missing or pre-existing object, or schema drift fails closed; no automatic repair is permitted. The legacy repository remains reference-only, and its implementation code is not copied into YEAR95.

## Consequences

- `db/baseline/schema.sql` is the bootstrap source of truth for an empty disposable database.
- Historical migration files and their checksums remain frozen.
- New schema changes are forward-only, additive and tested against a disposable PostgreSQL instance.
- Structural differences against an existing database stop the process for explicit maintainer review.
- Real-database comparison is pending until a read-only URL is supplied; lack of credentials is not permission to guess or to change the database.

## Related references

- [Database Baseline](../DB-BASELINE.md)
- [Database Deployment and SSL](../DEPLOY-DB.md)
- [Migration Matrix](../MIGRATION-MATRIX.md)
