/* global URL, console, process */
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PsqlDatabaseClient } from './postgres-client.mjs';
import { loadMigrationPlan } from './migration-files.mjs';
import { compareSchemaFingerprints } from '../packages/persistence/dist/schema-fingerprint.js';
import { runMigrations } from '../packages/persistence/dist/migrate.js';

function assertLocalDisposableUrl(connectionString) {
  let databaseUrl;
  try {
    databaseUrl = new URL(connectionString);
  } catch {
    throw new Error('DATABASE_URL must be a PostgreSQL URL pointing to a local disposable instance');
  }
  if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(databaseUrl.hostname)) {
    throw new Error('Refusing database baseline DDL for non-loopback host: ' + databaseUrl.hostname);
  }
}

async function main() {
  if (process.env.DB_BASELINE_DISPOSABLE !== '1') {
    throw new Error('Refusing to run: set DB_BASELINE_DISPOSABLE=1 only for a disposable local PostgreSQL database');
  }
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error('DATABASE_URL must point to a disposable local PostgreSQL database');
  assertLocalDisposableUrl(connectionString);

  const rootDir = fileURLToPath(new URL('..', import.meta.url));
  const plan = await loadMigrationPlan(rootDir);
  const admin = new PsqlDatabaseClient({ connectionString, schemaName: 'public' });
  const suffix = randomUUID().replaceAll('-', '');
  const baselineSchema = 'year95_baseline_' + suffix;
  const referenceSchema = 'year95_reference_' + suffix;
  await admin.transaction([
    { sql: 'CREATE SCHEMA "' + baselineSchema + '"' },
    { sql: 'CREATE SCHEMA "' + referenceSchema + '"' },
  ]);
  const baseline = new PsqlDatabaseClient({ connectionString, schemaName: baselineSchema });
  const reference = new PsqlDatabaseClient({ connectionString, schemaName: referenceSchema });
  const baselineReadOnly = new PsqlDatabaseClient({
    connectionString, schemaName: baselineSchema, readOnly: true,
  });
  const referenceReadOnly = new PsqlDatabaseClient({
    connectionString, schemaName: referenceSchema, readOnly: true,
  });
  try {
    await reference.transaction([{ sql: plan.baselineSchemaSql }]);
    await runMigrations(baseline, { plan });
    const localComparison = await compareSchemaFingerprints(
      referenceReadOnly, baselineReadOnly, referenceSchema, baselineSchema,
    );
    const tables = await referenceReadOnly.queryRows(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name",
      [referenceSchema],
    );
    const report = {
      source: 'db/baseline/schema.sql',
      schemaSqlSha256: plan.baselineRecords.find((record) => record.name === 'schema.sql')?.checksum,
      baselineMigrationCount: plan.baselineRecords.length - 1,
      migrationChecksums: plan.baselineRecords.map(({ name, checksum, origin }) => ({ name, checksum, origin })),
      schemaSummary: { tables: tables.length, indexesAndConstraintsVerifiedBy: 'schemaFingerprint' },
      localComparison: localComparison.equivalent
        ? 'PASS — empty-database runner matches canonical schema.sql'
        : 'DIVERGENCE — ' + localComparison.differences.join(', '),
      localDifferences: localComparison.differences,
      liveComparison: 'not requested',
    };
    if (!localComparison.equivalent) process.exitCode = 2;

    const readOnlyUrl = process.env.SUPABASE_READONLY_DATABASE_URL?.trim();
    if (readOnlyUrl) {
      const live = new PsqlDatabaseClient({
        connectionString: readOnlyUrl, schemaName: 'public', readOnly: true,
      });
      const comparison = await compareSchemaFingerprints(referenceReadOnly, live, referenceSchema, 'public');
      report.liveComparison = comparison.equivalent
        ? 'PASS — exact structural match (read-only)'
        : 'DIVERGENCE — ' + comparison.differences.join(', ');
      report.liveDifferences = comparison.differences;
      if (!comparison.equivalent) process.exitCode = 2;
    }
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await admin.transaction([
      { sql: 'DROP SCHEMA "' + baselineSchema + '" CASCADE' },
      { sql: 'DROP SCHEMA "' + referenceSchema + '" CASCADE' },
    ]);
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
