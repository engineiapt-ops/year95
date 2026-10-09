export const VERSION = '0.1.0';

export { assertRecordedChecksums, loadMigrationPlan, runMigrations } from './migrate.js';
export type {
  MigrationDatabase,
  MigrationPlan,
  MigrationRecord,
  RunMigrationsOptions,
  SchemaComparison,
  SqlStatement,
  SqlValue,
} from './migrate.js';
export { compareSchemaFingerprints, schemaFingerprint } from './schema-fingerprint.js';
export type { SchemaFingerprint, SchemaFingerprintComparison } from './schema-fingerprint.js';
