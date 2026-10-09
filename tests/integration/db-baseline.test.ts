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

integrationTest('canonical baseline includes the final effects of historical migrations 008-009 and 022-023', async () => {
  await withSchemas(async (_admin, target, _reference, targetSchema) => {
    await target.transaction([{ sql: schemaSql }]);

    const tables = await target.queryRows<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name",
      [targetSchema],
    );
    expect(tables.map((row) => row.table_name)).toEqual(expect.arrayContaining([
      'walk_forward_portfolio_runs',
      'walk_forward_portfolio_folds',
      'walk_forward_portfolio_equity',
      'instruments',
    ]));

    const indexes = await target.queryRows<{ indexname: string }>(
      'SELECT indexname FROM pg_indexes WHERE schemaname = $1 ORDER BY indexname',
      [targetSchema],
    );
    expect(indexes.map((row) => row.indexname)).toEqual(expect.arrayContaining([
      'idx_wf_portfolio_runs_wf',
      'idx_wf_portfolio_folds_run',
      'idx_wf_portfolio_equity_run_time',
      'idx_instruments_enabled',
    ]));

    const instruments = await target.queryRows<{
      symbol: string;
      venue: string;
      data_provider: string;
      metadata_status: string;
      enabled: boolean;
    }>(
      'SELECT symbol, venue, data_provider, metadata_status, enabled FROM instruments ORDER BY symbol',
    );
    expect(instruments).toEqual([
      {
        symbol: 'BTCUSD',
        venue: 'ig',
        data_provider: 'TODO_CONFIRMAR_NA_CORRETORA',
        metadata_status: 'pending_broker_confirmation',
        enabled: false,
      },
      {
        symbol: 'BTCUSDT',
        venue: 'binance_spot',
        data_provider: 'Binance Spot',
        metadata_status: 'verified',
        enabled: true,
      },
      {
        symbol: 'EURUSD',
        venue: 'saxo',
        data_provider: 'saxo-sim',
        metadata_status: 'pending_broker_confirmation',
        enabled: false,
      },
      {
        symbol: 'US500',
        venue: 'ig',
        data_provider: 'TODO_CONFIRMAR_NA_CORRETORA',
        metadata_status: 'pending_broker_confirmation',
        enabled: false,
      },
    ]);
  });
});

integrationTest('canonical baseline keeps database objects server-side when Supabase roles exist', async () => {
  await withSchemas(async (_admin, target, _reference, targetSchema) => {
    await target.transaction([{ sql: schemaSql }]);
    await target.transaction([{
      sql: 'CREATE TABLE baseline_future_privilege_probe (id BIGSERIAL PRIMARY KEY, note TEXT NOT NULL)',
    }]);

    const publicFunctionGrants = await target.queryRows<{ specific_name: string }>(
      "SELECT specific_name FROM information_schema.routine_privileges WHERE specific_schema = $1 AND grantee = 'PUBLIC' AND privilege_type = 'EXECUTE' ORDER BY specific_name",
      [targetSchema],
    );
    expect(publicFunctionGrants).toEqual([]);

    const roles = await target.queryRows<{ rolname: string }>(
      "SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') ORDER BY rolname",
    );
    for (const { rolname } of roles) {
      const tableGrants = await target.queryRows<{ table_name: string }>(
        [
          'SELECT c.relname AS table_name FROM pg_class c',
          'JOIN pg_namespace n ON n.oid = c.relnamespace',
          "WHERE n.nspname = $2 AND c.relkind IN ('r', 'p') AND (",
          "has_table_privilege($1, c.oid, 'SELECT') OR has_table_privilege($1, c.oid, 'INSERT') OR",
          "has_table_privilege($1, c.oid, 'UPDATE') OR has_table_privilege($1, c.oid, 'DELETE') OR",
          "has_table_privilege($1, c.oid, 'TRUNCATE') OR has_table_privilege($1, c.oid, 'REFERENCES') OR",
          "has_table_privilege($1, c.oid, 'TRIGGER')) ORDER BY c.relname",
        ].join(' '),
        [rolname, targetSchema],
      );
      expect(tableGrants, rolname + ' has unexpected table privileges').toEqual([]);

      const sequenceGrants = await target.queryRows<{ sequence_name: string }>(
        [
          'SELECT c.relname AS sequence_name FROM pg_class c',
          'JOIN pg_namespace n ON n.oid = c.relnamespace',
          "WHERE n.nspname = $2 AND c.relkind = 'S' AND (",
          "has_sequence_privilege($1, c.oid, 'USAGE') OR has_sequence_privilege($1, c.oid, 'SELECT') OR",
          "has_sequence_privilege($1, c.oid, 'UPDATE')) ORDER BY c.relname",
        ].join(' '),
        [rolname, targetSchema],
      );
      expect(sequenceGrants, rolname + ' has unexpected sequence privileges').toEqual([]);

      const functionGrants = await target.queryRows<{ routine_name: string }>(
        [
          'SELECT p.proname AS routine_name FROM pg_proc p',
          'JOIN pg_namespace n ON n.oid = p.pronamespace',
          "WHERE n.nspname = $2 AND has_function_privilege($1, p.oid, 'EXECUTE')",
          'ORDER BY p.proname',
        ].join(' '),
        [rolname, targetSchema],
      );
      expect(functionGrants, rolname + ' has unexpected function privileges').toEqual([]);
    }
  });
});

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
  await withSchemas(async (_admin, target, reference, targetSchema, referenceSchema) => {
    await target.transaction([{ sql: schemaSql }]);
    await reference.transaction([{ sql: schemaSql }]);
    await target.transaction([{ sql: 'ALTER TABLE market_data ADD COLUMN baseline_probe TEXT' }]);
    await expect(runMigrations(target, {
      plan,
      compareExistingSchema: async () => {
        const result = await compareSchemaFingerprints(reference, target, referenceSchema, targetSchema);
        return { equivalent: result.equivalent, differences: result.differences };
      },
    })).rejects.toThrow(/does not match db\/baseline\/schema\.sql/i);
    const tracker = await target.queryRows<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'schema_migrations') AS exists",
      [targetSchema],
    );
    expect(tracker[0]?.exists).toBe(false);
  });
});

integrationTest('rejects checksum mismatch before executing new SQL', async () => {
  await withSchemas(async (_admin, target) => {
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
