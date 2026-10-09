import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PsqlDatabaseClient } from './postgres-client.mjs';
import { compareSchemaFingerprints } from '../packages/persistence/dist/schema-fingerprint.js';
import { loadMigrationPlan } from '../packages/persistence/dist/migrate.js';

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
  const schemaSql = await readFile(path.join(rootDir, 'db/baseline/schema.sql'), 'utf8');
  const manifest = await loadMigrationPlan(rootDir);
  const admin = new PsqlDatabaseClient({ connectionString, schemaName: 'public' });
  const scratchName = 'year95_baseline_' + randomUUID().replaceAll('-', '');
  await admin.transaction([{ sql: 'CREATE SCHEMA "' + scratchName + '"' }]);
  const reference = new PsqlDatabaseClient({ connectionString, schemaName: scratchName });
  try {
    await reference.transaction([{ sql: schemaSql }]);
    const tables = await reference.queryRows(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = \\'BASE TABLE\\' ORDER BY table_name',
      [scratchName],
    );
    const report = {
      source: 'db/baseline/schema.sql',
      schemaSqlSha256: manifest.baselineRecords.find((record) => record.name === 'schema.sql')?.checksum,
      baselineMigrationCount: manifest.baselineRecords.length - 1,
      migrationChecksums: manifest.baselineRecords.map(({ name, checksum, origin }) => ({ name, checksum, origin })),
      schemaSummary: { tables: tables.length, indexesAndConstraintsVerifiedBy: 'schemaFingerprint' },
      liveComparison: 'not requested',
    };
    const readOnlyUrl = process.env.SUPABASE_READONLY_DATABASE_URL?.trim();
    if (readOnlyUrl) {
      const live = new PsqlDatabaseClient({
        connectionString: readOnlyUrl, schemaName: 'public', readOnly: true,
      });
      const comparison = await compareSchemaFingerprints(reference, live, scratchName, 'public');
      report.liveComparison = comparison.equivalent
        ? 'PASS — exact structural match (read-only)'
        : 'DIVERGENCE — ' + comparison.differences.join(', ');
      report.liveDifferences = comparison.differences;
      if (!comparison.equivalent) process.exitCode = 2;
    }
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await admin.transaction([{ sql: 'DROP SCHEMA "' + scratchName + '" CASCADE' }]);
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
