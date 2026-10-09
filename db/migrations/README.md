# Database migrations

Tracked migrations may be added only as 024_*.sql and above, after the current schema has been compared read-only with the repository baseline.

Destructive migrations are not permitted by the YEAR95 project contract. Run pnpm check:migrations before submitting a migration.

db/baseline is a historical archive and is intentionally excluded from check:migrations. Do not edit or execute its numbered scripts against a schema that already reflects their final result. New empty databases bootstrap from db/baseline/schema.sql; the 001–023 archive is recorded by checksum with origin baseline.
