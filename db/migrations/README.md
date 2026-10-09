# Database migrations

Tracked migrations may be added only as 024_*.sql and above, after the current schema has been compared read-only with the repository baseline.

Destructive migrations are not permitted by the YEAR95 project contract. Run pnpm check:migrations before submitting a migration.

db/baseline is a historical archive and is intentionally excluded from check:migrations. Do not edit or execute its numbered scripts against a schema that already reflects their final result. New empty databases bootstrap from db/baseline/schema.sql; the 001–023 archive is recorded by checksum with origin baseline.

Migration `024_add_instruments.sql` is idempotent against the canonical baseline and adds the final `instruments` registry to the specifically recognized legacy schema. The bridge is allowed only when the old filename ledger matches exactly migrations 001–018 and a read-only structural comparison proves that `instruments` is the only missing table. After 024 is applied and recorded atomically in the old ledger, the runner compares the complete canonical schema again before upgrading the migration ledger. Any unrelated drift, unknown history, or missing reference comparator fails closed. This bridge does not write to Supabase during CI.
