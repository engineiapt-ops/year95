/* global URL, console, process */
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PsqlDatabaseClient } from './postgres-client.mjs';
import { loadMigrationPlan } from './migration-files.mjs';
import {
  compareLiveSchemaFingerprints,
  compareSchemaFingerprintsIgnoringTables,
  schemaFingerprint,
} from '../packages/persistence/dist/schema-fingerprint.js';
import { runMigrations } from '../packages/persistence/dist/migrate.js';

function assertLocalDisposableUrl(connectionString) {
  let databaseUrl;
  try {
    databaseUrl = new URL(connectionString);
  } catch {
    throw new Error(
      'DATABASE_URL must be a PostgreSQL URL pointing to a local disposable instance',
    );
  }
  if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(databaseUrl.hostname)) {
    throw new Error(
      'Refusing database baseline DDL for non-loopback host: ' + databaseUrl.hostname,
    );
  }
}

async function main() {
  if (process.env.DB_BASELINE_DISPOSABLE !== '1') {
    throw new Error(
      'Refusing to run: set DB_BASELINE_DISPOSABLE=1 only for a disposable local PostgreSQL database',
    );
  }
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString)
    throw new Error('DATABASE_URL must point to a disposable local PostgreSQL database');
  assertLocalDisposableUrl(connectionString);

  const rootDir = fileURLToPath(new URL('..', import.meta.url));
  const plan = await loadMigrationPlan(rootDir);
  const indexCorrectionMigration = plan.migrations.find(
    ({ record }) => record.name === '028_reconcile_historical_indexes.sql',
  );
  if (!indexCorrectionMigration) {
    throw new Error('Canonical index correction migration 028 is missing');
  }
  const identityTablesMigration = plan.migrations.find(
    ({ record }) => record.name === '027_add_identity_repository_tables.sql',
  );
  if (!identityTablesMigration) {
    throw new Error('Expected identity table definition migration 027 is missing');
  }
  const admin = new PsqlDatabaseClient({ connectionString, schemaName: 'public' });
  const suffix = randomUUID().replaceAll('-', '');
  const baselineSchema = 'year95_baseline_' + suffix;
  const referenceSchema = 'year95_reference_' + suffix;
  const identitySchema = 'year95_identity_027_' + suffix;
  const baseline = new PsqlDatabaseClient({ connectionString, schemaName: baselineSchema });
  const reference = new PsqlDatabaseClient({ connectionString, schemaName: referenceSchema });
  const identity = new PsqlDatabaseClient({ connectionString, schemaName: identitySchema });
  const baselineReadOnly = new PsqlDatabaseClient({
    connectionString,
    schemaName: baselineSchema,
    readOnly: true,
  });
  const referenceReadOnly = new PsqlDatabaseClient({
    connectionString,
    schemaName: referenceSchema,
    readOnly: true,
  });
  const identityReadOnly = new PsqlDatabaseClient({
    connectionString,
    schemaName: identitySchema,
    readOnly: true,
  });
  const authState = await admin.queryRows(
    "SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') AS auth_schema_exists, to_regclass('auth.users') IS NOT NULL AS auth_users_exists",
  );
  const authSchemaExists = Boolean(authState[0]?.auth_schema_exists);
  const authUsersExists = Boolean(authState[0]?.auth_users_exists);
  const createdAuthSchema = !authSchemaExists && !authUsersExists;
  const createdAuthUsersStub = !authUsersExists;
  let schemasCreated = false;
  try {
    // Migration 027 conditionally adds the Supabase auth.users FK. Build its
    // expected fingerprint in this disposable database with a minimal auth.users
    // stub only when the local fixture does not already provide one.
    if (createdAuthSchema) await admin.transaction([{ sql: 'CREATE SCHEMA auth' }]);
    if (createdAuthUsersStub) {
      await admin.transaction([{ sql: 'CREATE TABLE auth.users (id UUID PRIMARY KEY)' }]);
    }
    await admin.transaction([
      { sql: 'CREATE SCHEMA "' + baselineSchema + '"' },
      { sql: 'CREATE SCHEMA "' + referenceSchema + '"' },
      { sql: 'CREATE SCHEMA "' + identitySchema + '"' },
    ]);
    schemasCreated = true;
    await reference.transaction([
      { sql: plan.baselineSchemaSql },
      { sql: indexCorrectionMigration.sql },
    ]);
    await runMigrations(baseline, { plan });
    // Apply only migration 027 in its own disposable schema: later migrations
    // must not silently expand the version-1 identity-table comparison contract.
    await identity.transaction([{ sql: identityTablesMigration.sql }]);
    const localComparison = await compareSchemaFingerprintsIgnoringTables(
      referenceReadOnly,
      baselineReadOnly,
      referenceSchema,
      baselineSchema,
      ['allowed_emails', 'user_profiles'],
    );
    const tables = await referenceReadOnly.queryRows(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name",
      [referenceSchema],
    );
    const report = {
      source: 'db/baseline/schema.sql + 028_reconcile_historical_indexes.sql',
      schemaSqlSha256: plan.baselineRecords.find((record) => record.name === 'schema.sql')
        ?.checksum,
      baselineMigrationCount: plan.baselineRecords.filter(({ name }) => /^\d{3}_/.test(name))
        .length,
      migrationChecksums: plan.baselineRecords.map(({ name, checksum, origin }) => ({
        name,
        checksum,
        origin,
      })),
      schemaSummary: {
        tables: tables.length,
        indexesAndConstraintsVerifiedBy: 'schemaFingerprint',
      },
      localComparison: localComparison.equivalent
        ? 'PASS — empty-database runner matches schema.sql plus forward migrations'
        : 'DIVERGENCE — ' + localComparison.differences.join(', '),
      localDifferences: localComparison.differences,
      liveComparison:
        'PENDING — SUPABASE_READONLY_DATABASE_URL not supplied; live comparison not run (2026-10-13)',
    };
    if (!localComparison.equivalent) process.exitCode = 2;

    const readOnlyUrl = process.env.SUPABASE_READONLY_DATABASE_URL?.trim();
    if (readOnlyUrl) {
      const live = new PsqlDatabaseClient({
        connectionString: readOnlyUrl,
        schemaName: 'public',
        readOnly: true,
      });
      const [canonicalFingerprint, liveFingerprint, migration027Fingerprint] = await Promise.all([
        schemaFingerprint(referenceReadOnly, referenceSchema),
        schemaFingerprint(live, 'public'),
        schemaFingerprint(identityReadOnly, identitySchema),
      ]);
      const comparison = compareLiveSchemaFingerprints(
        canonicalFingerprint,
        liveFingerprint,
        migration027Fingerprint,
      );
      report.liveComparison = comparison.equivalent
        ? 'PASS — no unexpected schema differences; migration 027 objects are accounted for'
        : 'DIVERGENCE — ' + comparison.unexpectedCount + ' unexpected object-level differences';
      report.liveDifferences = [
        ...new Set(comparison.unexpected.map(({ category }) => category)),
      ];
      report.liveExpectedDifferenceCount = comparison.expectedCount;
      report.liveUnexpectedDifferenceCount = comparison.unexpectedCount;
      report.liveExpectedDifferences = comparison.expected;
      report.liveUnexpectedDifferences = comparison.unexpected;
      report.liveDifferenceReport = {
        policy: comparison.policy,
        expected: {
          classification: 'EXPECTED',
          count: comparison.expectedCount,
          objects: comparison.expected,
        },
        unexpected: {
          classification: 'UNEXPECTED',
          count: comparison.unexpectedCount,
          objects: comparison.unexpected,
        },
      };
      if (!comparison.equivalent) process.exitCode = 2;
    }
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (schemasCreated) {
      await admin.transaction([
        { sql: 'DROP SCHEMA "' + baselineSchema + '" CASCADE' },
        { sql: 'DROP SCHEMA "' + referenceSchema + '" CASCADE' },
        { sql: 'DROP SCHEMA "' + identitySchema + '" CASCADE' },
      ]);
    }
    if (createdAuthUsersStub) await admin.transaction([{ sql: 'DROP TABLE auth.users' }]);
    if (createdAuthSchema) await admin.transaction([{ sql: 'DROP SCHEMA auth' }]);
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
