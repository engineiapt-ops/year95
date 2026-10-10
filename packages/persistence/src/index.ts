export const VERSION = '0.1.0';

export { assertRecordedChecksums, runMigrations } from './migrate.js';
export type {
  MigrationDatabase,
  MigrationPlan,
  MigrationRecord,
  LegacySchemaBridge,
  RunMigrationsOptions,
  SchemaComparison,
  SqlStatement,
  SqlValue,
} from './migrate.js';
export { compareSchemaFingerprints, compareSchemaFingerprintsIgnoringTables, schemaFingerprint } from './schema-fingerprint.js';
export type { SchemaFingerprint, SchemaFingerprintComparison } from './schema-fingerprint.js';
export { createSupabaseReadinessProbe } from './supabase-readiness.js';
export type { ReadinessProbe, SupabaseReadinessConfig } from './supabase-readiness.js';
\nexport { createPgPool, withTransaction } from "./pg-pool.js";\nexport type { PgClient, PgPool, PgPoolConfig, PgPoolConstructor, PgPoolOptions, PgQueryable, PgQueryResult } from "./pg-pool.js";\nexport { PgAllowlistRepository, PgHealthRepository, PgInstrumentRepository } from "./pg-repositories.js";\n