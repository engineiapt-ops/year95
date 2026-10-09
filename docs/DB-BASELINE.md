# Database baseline report

Status: **manifest generated from the preserved historical source; automated structural comparison is provided; live Supabase comparison has not been run in this PR.**

## Source and interpretation

The immutable historical source is engineiapt-ops/ai-financial-analyst at `e539b1583276c40b6793986d947134e82921ca74`. The 23 files are archived as-is. `db/baseline/schema.sql` is the canonical final schema after the historical sequence.

A blank database is bootstrapped from `db/baseline/schema.sql`. The 23 historical files are recorded in `schema_migrations` with SHA-256 checksums and `origin=baseline`, but are not re-executed. This avoids running transition scripts against a schema that already contains their final state. Existing databases are never bootstrapped: baseline metadata is recorded only after an injected comparator proves structural equivalence. A missing comparator, checksum mismatch, unknown migration, or structural divergence fails closed.

## SHA-256 manifest

| File | SHA-256 |
|---|---|
| schema.sql | 30748ff7cb2741184344ab70d51edc5cb6f9cea312abe47541c3fe67eee67001 |
| 001_backtest_runs.sql | a3e66fd79a0f9d79958f81cec1efcc4ae43dcd3efb7fe1815442b05f6bf33b96 |
| 002_backtest_dataset_hash.sql | 7bdfe6346f01f5db2091519566ef1aed3f746e57e840974e9584ee40609db594 |
| 003_execution_model.sql | e7869eaecb40e80ae90e7acb54afad9a6f0935e1b920877dc8399b92208ec7ad |
| 004_decision_log_benchmark.sql | 03654a4f1bbc0de07b836251bf1ed696a82bcc2c5d850752367cb52d50d65808 |
| 005_walk_forward.sql | 2770f4c5a5488791dc6b9041edb4e92f45b9ead635242455254620d3d222b2b6 |
| 006_portfolio_engine.sql | a70fa2aab0940dcedc05755ed878737efb09d476570de5d3e517e8e96008042c |
| 007_walk_forward_risk.sql | 4f8781c90dc8fc2dfd22c6b5b89bd1ccd3b7b34dd5ed4223a05b43869ddc3064 |
| 008_walk_forward_portfolio.sql | 5920a67403fa5723dcfb0353e21ba2cb982ee6eda05b833cee91c49b87fe3ea0 |
| 009_walk_forward_portfolio_equity.sql | 236e7b59fa8e5c5bd74b918437ea3970943af42ce79dc8dcb8825460048e9856 |
| 010_research_snapshots.sql | edbab100f3d35e066eee6a45bb816934598f4b40605f8411305b70107e0f2c3b |
| 011_oos_evaluation_policy.sql | 66f5ae303fac83900b279195aa7423385603330dc43016e6580b66c1ea3cf286 |
| 012_walk_forward_risk_strategy.sql | 8e5ca99b9dcf89a71162c2d0a362bb7ffd1f8697908733b980421549f0800110 |
| 013_oos_validation_gate_audit.sql | c045b67b5f71c73a78c0ddacf6d1ea66131fc1cd8b878bfc154d8d3f49e81445 |
| 014_oos_validation_gate_evidence.sql | 3a13a21f7c5e563f8c35189a637b2a0992b6b187a7b19992aa7ac81291abd975 |
| 015_pipeline_audit_snapshots.sql | e92acd89f6af029b66fa2783db433eca85e44154b9bfa947e01674f0cdfc5ce8 |
| 016_outcome_settlement_audits.sql | f23210f5339fead05b7e21459dc058ded3f7f36c131d5396240507b412e9d9f3 |
| 017_system_validation_snapshots.sql | b18ca9cd485b13488158fc1f85fcf9a7afeeefb0680d2f045f57684c6675c537 |
| 018_align_research_snapshot_decision_log_type.sql | 2d8c1893148797d271a2868febbd7acc7fc70fdaa0a1b4a96c4c40a4949f567a |
| 019_revoke_public_data_api_grants.sql | 625b4da0027cb387640b81a08a2d4ac1992349e9f1650c647cf11f064276e271 |
| 020_revoke_public_function_execute.sql | 3674e30df8cca5f5c932daa44e543cd1b2844583518b8368d07a057137ec702e |
| 021_decision_log_paper_idempotency.sql | bd81b46b49e02b3c72c1354a701d5879a7f70375e7cd7fc4e2f9cef7f1157f47 |
| 022_instruments.sql | 04bee2fb7a670973f486375fe94ca21b2c28bd9189e6388951c1ad819ff2992b |
| 023_saxo_instruments.sql | a182d51db4b86271f9e326948c1f853cece79b1565de7d56238b5a6cd0cd8d7f |

## Schema comparison

The structural fingerprint covers tables/views, ordered column definitions (types, defaults and nullability), constraints and definitions, index definitions, and non-internal triggers plus trigger-function definitions. The comparison is read-only and normalizes schema names before equality checks.

The optional Supabase comparison is separate and read-only. `tools/db-baseline.mjs` refuses to run unless `DB_BASELINE_DISPOSABLE=1` is set, to guard its temporary-schema DDL. If `SUPABASE_READONLY_DATABASE_URL` is supplied, the comparator uses the connection only for read-only catalog SELECTs. No live database has been accessed by this PR.

The canonical schema now includes the final effects of historical migrations 008–009 (walk-forward portfolio tables and indexes) and 022–023 (the instruments table, final Saxo venue constraint, and initial reference rows). It also preserves the server-side-only privilege effects of migrations 019–020. The integration tests check these objects and reference rows so the canonical schema cannot silently drift behind the preserved migration history.

## Recognized legacy upgrade path

Migration `024_add_instruments.sql` adds the final `instruments` table and four reference instruments. It is idempotent on a fresh database whose canonical baseline already includes that table. The migration runner may use it to upgrade one narrowly defined legacy state: a `schema_migrations(filename, applied_at)` ledger containing exactly historical migrations 001–018 and a read-only schema fingerprint equal to the canonical schema when only the `instruments` table and its dependent constraints/indexes are excluded. The runner applies 024 and inserts its filename in one transaction, then requires a full schema fingerprint match before upgrading the legacy ledger or recording missing baseline metadata. Other ledger contents or schema differences fail closed. The live Supabase database remains read-only until a separately authorized deployment step.

## Commands

- `pnpm check:migrations` validates only `db/migrations/` and rejects filenames below 024, sequence gaps and destructive DDL. `db/baseline/` is intentionally excluded.
- `DATABASE_URL=postgresql://... DB_BASELINE_DISPOSABLE=1 pnpm db:baseline` applies `schema.sql` in a temporary schema of a disposable local database and prints the manifest/schema report.
- Add `SUPABASE_READONLY_DATABASE_URL=...` to the previous command to compare the disposable baseline against the live public schema using SELECT-only queries.
- `DATABASE_URL=... DB_BASELINE_REFERENCE_URL=... pnpm --filter @year95/persistence migrate` runs the forward-only runner. An existing target database fails closed if a reference comparator is not provided or the schema diverges.
