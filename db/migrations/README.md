# Database migrations

Tracked migrations may be added only as 024_*.sql and above, after the current schema has been compared read-only with the repository baseline.

Destructive migrations are not permitted by the YEAR95 project contract. Run pnpm check:migrations before submitting a migration.

db/baseline is a historical archive and is intentionally excluded from check:migrations. Do not edit or execute its numbered scripts against a schema that already reflects their final result. New empty databases bootstrap from db/baseline/schema.sql; the 001–023 archive is recorded by checksum with origin baseline.

Migrations `024_add_instruments.sql` and `025_add_decision_log_paper_idempotency.sql` are idempotent against the canonical baseline. The narrowly scoped legacy bridge accepts only the old filename ledger containing exactly migrations 001–018 and a read-only structural fingerprint matching the canonical schema after excluding both known missing objects: the `instruments` registry and the `idx_decision_log_paper_idempotency` partial unique index. Both migrations and their legacy filename records are applied in one transaction. The runner then compares the complete canonical schema again before upgrading the migration ledger. Any unrelated drift, an already-present excluded object, unknown history, or missing reference comparator fails closed. CI exercises this recovery only in disposable PostgreSQL schemas; it never writes to Supabase.

Migration `026_enable_rls_and_pin_audit_search_path.sql` enables row-level security on all public application tables and the application migration ledger without adding client policies or grants. This intentionally keeps direct `anon`/`authenticated` table access default-deny; requests are authorized through the Fastify backend and owner-scoped persistence. It also pins the five immutable audit trigger functions to `search_path = pg_catalog`; those functions reference no application objects. The migration is idempotent and is tested against a disposable PostgreSQL schema.
