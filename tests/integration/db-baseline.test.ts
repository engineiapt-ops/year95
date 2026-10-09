import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { runMigrations, type MigrationDatabase, type SqlStatement } from '../../packages/persistence/src/migrate.js';
import { compareSchemaFingerprints } from '../../packages/persistence/src/schema-fingerprint.js';
import { loadMigrationPlan } from '../../tools/migration-files.mjs';
import { PsqlDatabaseClient } from '../../tools/postgres-client.mjs';

const connectionString = process.env.DATABASE_URL?.trim();
const rootDir = fileURLToPath(new URL('../../', import.meta.url));
const schemaSql = await readFile(path.join(rootDir, 'db/baseline/schema.sql'), 'utf8');
const plan = await loadMigrationPlan(rootDir);
const integrationTest = test.skipIf(!connectionString);

async function createSchema(admin: PsqlDatabaseClient, schemaName: string): Promise<void> {
  await admin.transaction([{ sql: 'CREATE SCHEMA "' + schemaName + '"' }]);
}
async function dropSchema(admin: PsqlDatabaseClient, schemaName: string): Promise<void> {
  await admin.transaction([{ sql: 'DROP SCHEMA IF EXISTS "' + schemaName + '" CASCADE' }]);
}
async function withSchemas(
  run: (admin: PsqlDatabaseClient, target: PsqlDatabaseClient, reference: PsqlDatabaseClient, targetSchema: string, referenceSchema: string) => Promise<void>,
): Promise<void> {
  const admin = new PsqlDatabaseClient({ connectionString: connectionString! });
  const targetSchema = 'year95_target_' + randomUUID().replaceAll('-', '');
  const referenceSchema = 'year95_reference_' + randomUUID().replaceAll('-', '');
  await createSchema(admin, targetSchema);
  await createSchema(admin, referenceSchema);
  try {
    const target = new PsqlDatabaseClient({ connectionString: connectionString!, schemaName: targetSchema });
    const reference = new PsqlDatabaseClient({ connectionString: connectionString!, schemaName: referenceSchema });
    await run(admin, target, reference, targetSchema, referenceSchema);
  } finally {
    await dropSchema(admin, targetSchema);
    await dropSchema(admin, referenceSchema);
  }
}

integrationTest('empty database baseline equals canonical schema.sql structure', async () => {
  await withSchemas(async (_admin, target, reference, targetSchema, referenceSchema) => {
    await reference.transaction([{ sql: schemaSql }]);
    await runMigrations(target, { plan });
    const comparison = await compareSchemaFingerprints(reference, target, referenceSchema, targetSchema);
    expect(comparison.equivalent, comparison.differences.join(', ')).toBe(true);
    const rows = await target.queryRows<{ name: string; origin: string }>(
      'SELECT name, origin FROM schema_migrations ORDER BY name',
    );
    expect(rows.filter((row) => row.origin === 'baseline')).toHaveLength(24);
  });
});

integrationTest('equivalent existing database is marked without replaying baseline or altering data', async () => {
  await withSchemas(async (_admin, target, reference, targetSchema, referenceSchema) => {
    await target.transaction([{ sql: schemaSql }]);
    await reference.transaction([{ sql: schemaSql }]);
    await target.transaction([{
      sql: "INSERT INTO market_data (ativo, timeframe, open_time, open, high, low, close, volume) VALUES ('BTCUSDT', '1h', TIMESTAMPTZ '2026-01-01 00:00:00+00', 1, 1, 1, 1, 1)",
    }]);
    const transactionSql: string[] = [];
    const observed: MigrationDatabase = {
      queryRows: (sql, values) => target.queryRows(sql, values),
      transaction: (statements: readonly SqlStatement[]) => {
        transactionSql.push(statements.map((statement) => statement.sql).join('\n'));
        return target.transaction(statements);
      },
    };
    await runMigrations(observed, {
      plan,
      compareExistingSchema: async () => {
        const result = await compareSchemaFingerprints(reference, target, referenceSchema, targetSchema);
        return { equivalent: result.equivalent, differences: result.differences };
      },
    });
    expect(transactionSql.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS market_data'))).toBe(false);
    const preserved = await target.queryRows<{ count: number | string }>(
      'SELECT COUNT(*)::int AS count FROM market_data',
    );
    expect(Number(preserved[0]?.count)).toBe(1);
  });
});

integrationTest('refuses to mark an existing database when schema comparison fails', async () => {
  await withSchemas(async (_admin, target, _reference, targetSchema) => {
    await target.transaction([{ sql: schemaSql }]);
    await expect(runMigrations(target, {
      plan,
      compareExistingSchema: async () => ({ equivalent: false, differences: ['columns'] }),
    })).rejects.toThrow(/does not match db\/baseline\/schema\.sql/i);
    const tracker = await target.queryRows<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'schema_migrations') AS exists",
      [targetSchema],
    );
    expect(tracker[0]?.exists).toBe(false);
  });
});

integrationTest('rejects checksum mismatch before executing new SQL', async () => {
  await withSchemas(async (_admin, target, _reference) => {
    await runMigrations(target, { plan });
    await target.transaction([{
      sql: "UPDATE schema_migrations SET checksum = repeat('0', 64) WHERE name = '001_backtest_runs.sql'",
    }]);
    await expect(runMigrations(target, {
      plan,
      compareExistingSchema: async () => ({ equivalent: true }),
    })).rejects.toThrow(/checksum changed/i);
    const unchanged = await target.queryRows<{ count: number | string }>(
      "SELECT COUNT(*)::int AS count FROM schema_migrations WHERE name = '001_backtest_runs.sql' AND checksum = repeat('0', 64)",
    );
    expect(Number(unchanged[0]?.count)).toBe(1);
  });
});
