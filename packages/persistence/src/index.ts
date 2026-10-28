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
export {
  compareSchemaFingerprints,
  compareSchemaFingerprintsIgnoringTables,
  schemaFingerprint,
} from './schema-fingerprint.js';
export type { SchemaFingerprint, SchemaFingerprintComparison } from './schema-fingerprint.js';
export { createPgPool, withTransaction } from './pg-pool.js';
export type {
  PgClient,
  PgPool,
  PgPoolConfig,
  PgPoolConstructor,
  PgPoolOptions,
  PgQueryable,
  PgQueryResult,
} from './pg-pool.js';
export {
  PgAllowlistRepository,
  PgHealthRepository,
  PgInstrumentRepository,
} from './pg-repositories.js';
export {
  PgMarketDataRepository,
  PERSISTABLE_MARKET_TIMEFRAMES,
} from './pg-market-data-repository.js';
export type {
  ClosedMarketCandle,
  PersistClosedCandlesInput,
  PersistableMarketTimeframe,
  QueryClosedCandlesInput,
  StoredMarketCandle,
} from './pg-market-data-repository.js';
