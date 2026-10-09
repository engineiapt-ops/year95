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
