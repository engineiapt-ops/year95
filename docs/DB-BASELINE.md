# Database baseline report

Status: **READ-ONLY CATALOG INSPECTION FOUND TWO OMITTED INDEXES AND COLUMN-ORDINAL DIFFERENCES (2026-10-13).** The canonical baseline correction is implemented in this branch. The full executable fingerprint comparison remains pending because `SUPABASE_READONLY_DATABASE_URL` is not available to the local comparator. No live schema or data was changed.

## Source and interpretation

The immutable historical source is engineiapt-ops/ai-financial-analyst at `e539b1583276c40b6793986d947134e82921ca74`. The 23 historical migration files and the previously recorded `db/baseline/schema.sql` checksum are preserved. The canonical structural baseline is `schema.sql` plus `schema-corrections.sql`, which adds two indexes that existed in the historical final state but were omitted from the schema snapshot.

A blank database is bootstrapped from `db/baseline/schema.sql` followed by `db/baseline/schema-corrections.sql`, in the same transaction. The 23 historical files are recorded in `schema_migrations` with SHA-256 checksums and `origin=baseline`, but are not re-executed. The new corrections file has its own checksum record; this preserves the existing `schema.sql` ledger checksum. Existing databases are never bootstrapped: missing baseline metadata is recorded only after an injected comparator proves structural equivalence. A missing comparator, checksum mismatch, unknown migration, or structural divergence fails closed.

## SHA-256 manifest

| File                                              | SHA-256                                                          |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| schema.sql                                        | 30748ff7cb2741184344ab70d51edc5cb6f9cea312abe47541c3fe67eee67001 |
| schema-corrections.sql                            | 3a74112236609c0e097f440098f522f0455afd75c7c71522a1d26f3ecc82d475 |
| 001_backtest_runs.sql                             | a3e66fd79a0f9d79958f81cec1efcc4ae43dcd3efb7fe1815442b05f6bf33b96 |
| 002_backtest_dataset_hash.sql                     | 7bdfe6346f01f5db2091519566ef1aed3f746e57e840974e9584ee40609db594 |
| 003_execution_model.sql                           | e7869eaecb40e80ae90e7acb54afad9a6f0935e1b920877dc8399b92208ec7ad |
| 004_decision_log_benchmark.sql                    | 03654a4f1bbc0de07b836251bf1ed696a82bcc2c5d850752367cb52d50d65808 |
| 005_walk_forward.sql                              | 2770f4c5a5488791dc6b9041edb4e92f45b9ead635242455254620d3d222b2b6 |
| 006_portfolio_engine.sql                          | a70fa2aab0940dcedc05755ed878737efb09d476570de5d3e517e8e96008042c |
| 007_walk_forward_risk.sql                         | 4f8781c90dc8fc2dfd22c6b5b89bd1ccd3b7b34dd5ed4223a05b43869ddc3064 |
| 008_walk_forward_portfolio.sql                    | 5920a67403fa5723dcfb0353e21ba2cb982ee6eda05b833cee91c49b87fe3ea0 |
| 009_walk_forward_portfolio_equity.sql             | 236e7b59fa8e5c5bd74b918437ea3970943af42ce79dc8dcb8825460048e9856 |
| 010_research_snapshots.sql                        | edbab100f3d35e066eee6a45bb816934598f4b40605f8411305b70107e0f2c3b |
| 011_oos_evaluation_policy.sql                     | 66f5ae303fac83900b279195aa7423385603330dc43016e6580b66c1ea3cf286 |
| 012_walk_forward_risk_strategy.sql                | 8e5ca99b9dcf89a71162c2d0a362bb7ffd1f8697908733b980421549f0800110 |
| 013_oos_validation_gate_audit.sql                 | c045b67b5f71c73a78c0ddacf6d1ea66131fc1cd8b878bfc154d8d3f49e81445 |
| 014_oos_validation_gate_evidence.sql              | 3a13a21f7c5e563f8c35189a637b2a0992b6b187a7b19992aa7ac81291abd975 |
| 015_pipeline_audit_snapshots.sql                  | e92acd89f6af029b66fa2783db433eca85e44154b9bfa947e01674f0cdfc5ce8 |
| 016_outcome_settlement_audits.sql                 | f23210f5339fead05b7e21459dc058ded3f7f36c131d5396240507b412e9d9f3 |
| 017_system_validation_snapshots.sql               | b18ca9cd485b13488158fc1f85fcf9a7afeeefb0680d2f045f57684c6675c537 |
| 018_align_research_snapshot_decision_log_type.sql | 2d8c1893148797d271a2868febbd7acc7fc70fdaa0a1b4a96c4c40a4949f567a |
| 019_revoke_public_data_api_grants.sql             | 625b4da0027cb387640b81a08a2d4ac1992349e9f1650c647cf11f064276e271 |
| 020_revoke_public_function_execute.sql            | 3674e30df8cca5f5c932daa44e543cd1b2844583518b8368d07a057137ec702e |
| 021_decision_log_paper_idempotency.sql            | bd81b46b49e02b3c72c1354a701d5879a7f70375e7cd7fc4e2f9cef7f1157f47 |
| 022_instruments.sql                               | 04bee2fb7a670973f486375fe94ca21b2c28bd9189e6388951c1ad819ff2992b |
| 023_saxo_instruments.sql                          | a182d51db4b86271f9e326948c1f853cece79b1565de7d56238b5a6cd0cd8d7f |

## Schema comparison

The structural fingerprint covers tables/views, column definitions by table and column name (types, defaults and nullability), constraints and definitions, index definitions, and non-internal triggers plus trigger-function definitions. It deliberately ignores physical column ordinal: ALTER TABLE ADD COLUMN appends fields to the end, but ordinal changes alone are not a structural mismatch for queries using named columns. It normalizes schema names and strips only the exact `SET search_path TO 'pg_catalog'` function configuration clause from `pg_get_functiondef()`; the five function settings are independently asserted by the RLS/search-path integration test.

The optional Supabase comparison is separate and read-only. `tools/db-baseline.mjs` refuses to run unless `DB_BASELINE_DISPOSABLE=1` is set, to guard its temporary-schema DDL. If `SUPABASE_READONLY_DATABASE_URL` is supplied, the comparator uses the connection only for read-only catalog SELECTs. No live database has been accessed by this PR.

The canonical schema includes final effects of historical migrations 007–009 and 011 (walk-forward and OOS indexes), 008–009 (walk-forward portfolio tables and indexes), and 022–023 (the instruments table, final Saxo venue constraint, and initial reference rows). The two indexes omitted from `schema.sql` are declared in `schema-corrections.sql` without changing the immutable schema.sql checksum. The baseline also preserves the server-side-only privilege effects represented by migrations 019–020. Integration tests assert the omitted historical indexes exist in the canonical result.

## Comparação com o banco real

**Estado em 2026-10-13: DIVERGÊNCIAS IDENTIFICADAS POR CONSULTAS DE CATÁLOGO SOMENTE DE LEITURA; COMPARAÇÃO COMPLETA PELO RUNNER AINDA PENDENTE.** A inspeção autorizada do projeto Supabase `ai-financial-analyse` confirmou que as 23 tabelas de aplicação esperadas existem, que os 24 registros históricos do baseline têm checksums correspondentes e que os cinco triggers de imutabilidade estão presentes. Também identificou duas diferenças corrigidas nesta branch: `idx_backtest_runs_oos_validation` e `idx_wf_folds_strategy_run` existiam no banco, mas faltavam no schema snapshot; três tabelas tinham uma ordem física de colunas diferente. O arquivo `schema-corrections.sql` registra os índices sem reescrever o `schema.sql` imutável, e o fingerprint agora compara definições de coluna por nome, não por posição.

Esta inspeção manual não é reportada como PASS do comparador integral. Para obter o resultado final do runner, execute a comparação em um ambiente com PostgreSQL local descartável e uma URL Supabase dedicada somente leitura, usando `DB_BASELINE_DISPOSABLE=1 SUPABASE_READONLY_DATABASE_URL=... pnpm db:baseline` e `DATABASE_URL` apontando para o PostgreSQL local. Registre o resultado exato. A conexão remota deve executar apenas consultas de catálogo `SELECT`. Se qualquer outra divergência aparecer, interrompa e peça uma decisão do mantenedor; não altere o banco remoto e não aplique migrations automaticamente.

**Limite desta correção:** nenhuma escrita foi realizada no Supabase. O histórico remoto registra as migrations 024–026; a migration 027 atualmente versionada no repositório não foi executada nem faz parte desta reconciliação somente de leitura.

## Recognized legacy upgrade path

Migrations `024_add_instruments.sql` and `025_add_decision_log_paper_idempotency.sql` provide an additive recovery path for the final `instruments` table, its four reference instruments, and the historical paper-decision idempotency guarantee. The bridge accepts only a `schema_migrations(filename, applied_at)` ledger containing exactly historical migrations 001–018 and a read-only structural fingerprint matching the canonical schema after excluding both known missing objects: `instruments` and `idx_decision_log_paper_idempotency`. It applies 024 and 025 and records both filenames in one transaction. The complete canonical fingerprint must match before the legacy ledger is upgraded or missing baseline metadata is recorded. Other ledger contents, either object already being present, or any other schema drift fail closed. The live Supabase database remains untouched by CI and must not be migrated until a separately authorized deployment step.

## Commands

- `pnpm check:migrations` validates only `db/migrations/` and rejects filenames below 024, sequence gaps and destructive DDL. `db/baseline/` is intentionally excluded.
- `DATABASE_URL=postgresql://... DB_BASELINE_DISPOSABLE=1 pnpm db:baseline` applies `schema.sql` in a temporary schema of a disposable local database and prints the manifest/schema report.
- Add `SUPABASE_READONLY_DATABASE_URL=...` to the previous command to compare the disposable baseline against the live public schema using SELECT-only queries.
- `DATABASE_URL=... DB_BASELINE_REFERENCE_URL=... pnpm --filter @year95/persistence migrate` runs the forward-only runner. An existing target database fails closed if a reference comparator is not provided or the schema diverges.
