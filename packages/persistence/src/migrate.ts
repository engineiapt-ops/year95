export type SqlValue = string | number | boolean | null;
export interface SqlStatement { sql: string; values?: readonly SqlValue[] }
export interface MigrationDatabase {
  queryRows<Row extends Record<string, unknown> = Record<string, unknown>>(
    sql: string, values?: readonly SqlValue[],
  ): Promise<readonly Row[]>;
  transaction(statements: readonly SqlStatement[]): Promise<void>;
}
export interface MigrationRecord { name: string; checksum: string; origin: 'baseline' | 'migration' }
export interface MigrationPlan {
  baselineSchemaSql: string;
  baselineRecords: readonly MigrationRecord[];
  migrations: readonly { record: MigrationRecord; sql: string }[];
  allRecords: readonly MigrationRecord[];
}
export interface SchemaComparison { equivalent: boolean; differences?: readonly string[] }
export interface LegacySchemaBridge {
  /** Ordered additive migrations that atomically convert the supported legacy schema to the canonical baseline. */
  migrationNames: readonly string[];
  /** Exact historical filename set accepted before the bridge is allowed to run. */
  expectedAppliedNames: readonly string[];
  /** Read-only comparator for the supported legacy schema, excluding only known missing objects. */
  compareSchema: () => Promise<SchemaComparison>;
}
export interface RunMigrationsOptions {
  plan: MigrationPlan;
  compareExistingSchema?: () => Promise<SchemaComparison>;
  legacySchemaBridge?: LegacySchemaBridge;
}

/** Reject unknown, tampered or reclassified ledger entries before any database write. */
export function assertRecordedChecksums(
  applied: readonly MigrationRecord[],
  expected: readonly MigrationRecord[],
): void {
  const expectedByName = new Map(expected.map((record) => [record.name, record]));
  for (const record of applied) {
    const current = expectedByName.get(record.name);
    if (!current) throw new Error('Unknown applied migration ' + record.name + '; refusing to continue');
    if (current.checksum !== record.checksum) {
      throw new Error('Checksum changed for ' + record.name + '; refusing to continue');
    }
    if (current.origin !== record.origin) {
      throw new Error('Migration origin changed for ' + record.name + '; refusing to continue');
    }
  }
}
function recordFromRow(row: Record<string, unknown>): MigrationRecord {
  if (typeof row.name !== 'string' || typeof row.checksum !== 'string' ||
      (row.origin !== 'baseline' && row.origin !== 'migration')) {
    throw new Error('schema_migrations contains malformed records; refusing to continue');
  }
  return { name: row.name, checksum: row.checksum, origin: row.origin };
}
function makeInsert(record: MigrationRecord, hasLegacyFilename: boolean): SqlStatement {
  if (hasLegacyFilename) {
    return {
      sql: 'INSERT INTO schema_migrations (filename, name, checksum, origin) VALUES ($1, $1, $2, $3) ON CONFLICT (name) DO NOTHING',
      values: [record.name, record.checksum, record.origin],
    };
  }
  return {
    sql: 'INSERT INTO schema_migrations (name, checksum, origin) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING',
    values: [record.name, record.checksum, record.origin],
  };
}
function createTrackerSql(): string {
  return [
    'CREATE TABLE IF NOT EXISTS schema_migrations (',
    '  name TEXT PRIMARY KEY,',
    '  checksum TEXT NOT NULL,',
    "  origin TEXT NOT NULL CHECK (origin IN ('baseline', 'migration')),",
    '  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()',
    ')',
  ].join('\n');
}
async function trackerColumns(db: MigrationDatabase): Promise<Set<string>> {
  const rows = await db.queryRows<{ column_name: string }>(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'schema_migrations'",
  );
  return new Set(rows.map((row) => row.column_name));
}
async function hasTracker(db: MigrationDatabase): Promise<boolean> {
  const rows = await db.queryRows<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'schema_migrations') AS exists",
  );
  return rows[0]?.exists === true;
}
async function userObjectCount(db: MigrationDatabase): Promise<number> {
  const rows = await db.queryRows<{ object_count: number | string }>([
    'SELECT COUNT(*)::int AS object_count FROM (',
    ' SELECT table_name AS object_name FROM information_schema.tables',
    "  WHERE table_schema = current_schema() AND table_name <> 'schema_migrations'",
    ' UNION ALL SELECT routine_name AS object_name FROM information_schema.routines WHERE routine_schema = current_schema()',
    ' UNION ALL SELECT sequence_name AS object_name FROM information_schema.sequences WHERE sequence_schema = current_schema()',
    ') AS user_objects',
  ].join('\n'));
  return Number(rows[0]?.object_count ?? 0);
}
async function currentRecords(db: MigrationDatabase, columns: ReadonlySet<string>): Promise<MigrationRecord[]> {
  if (!columns.has('name') || !columns.has('checksum') || !columns.has('origin')) return [];
  const rows = await db.queryRows<Record<string, unknown>>(
    'SELECT name, checksum, origin FROM schema_migrations ORDER BY name',
  );
  return rows.map(recordFromRow);
}
async function compareExisting(
  compareExistingSchema: RunMigrationsOptions['compareExistingSchema'],
): Promise<SchemaComparison> {
  if (!compareExistingSchema) {
    throw new Error('Existing database has no complete baseline ledger; supply a schema comparator. Baseline was not executed.');
  }
  return compareExistingSchema();
}
function assertComparisonEquivalent(result: SchemaComparison): void {
  if (!result.equivalent) {
    const details = result.differences?.length ? ': ' + result.differences.join('; ') : '';
    throw new Error('Existing database does not match db/baseline/schema.sql' + details);
  }
}
async function assertEquivalent(
  compareExistingSchema: RunMigrationsOptions['compareExistingSchema'],
): Promise<void> {
  assertComparisonEquivalent(await compareExisting(compareExistingSchema));
}
async function legacyTrackerNames(
  db: MigrationDatabase,
  columns: ReadonlySet<string>,
): Promise<string[]> {
  const sourceNameColumn = columns.has('filename') ? 'filename' : columns.has('name') ? 'name' : null;
  if (!sourceNameColumn) throw new Error('Unsupported schema_migrations layout; refusing to mutate it');
  const rows = await db.queryRows<{ name: string }>(
    'SELECT ' + sourceNameColumn + ' AS name FROM schema_migrations ORDER BY ' + sourceNameColumn,
  );
  return rows.map((row) => row.name);
}
function assertExpectedLegacyHistory(
  actualNames: readonly string[],
  expectedNames: readonly string[],
): void {
  const actual = [...actualNames].sort();
  const expected = [...expectedNames].sort();
  if (actual.length !== expected.length || actual.some((name, index) => name !== expected[index])) {
    throw new Error('Legacy migration history does not match the supported compatibility bridge; refusing to continue');
  }
}
async function applyLegacySchemaBridge(
  db: MigrationDatabase,
  columns: ReadonlySet<string>,
  plan: MigrationPlan,
  bridge: LegacySchemaBridge,
): Promise<void> {
  if (!columns.has('filename') || columns.has('name') || columns.has('checksum') || columns.has('origin')) {
    throw new Error('The compatibility bridge only accepts the recognized legacy filename ledger');
  }
  assertExpectedLegacyHistory(await legacyTrackerNames(db, columns), bridge.expectedAppliedNames);
  if (bridge.migrationNames.length === 0 ||
      new Set(bridge.migrationNames).size !== bridge.migrationNames.length) {
    throw new Error('Legacy schema bridge must declare a non-empty, unique ordered migration list');
  }
  const migrations = bridge.migrationNames.map((migrationName) => {
    const migration = plan.migrations.find(({ record }) => record.name === migrationName);
    if (!migration) {
      throw new Error('Supported legacy bridge migration is not present in the migration plan: ' + migrationName);
    }
    return migration;
  });
  const comparison = await bridge.compareSchema();
  if (!comparison.equivalent) {
    const details = comparison.differences?.length ? ': ' + comparison.differences.join('; ') : '';
    throw new Error('Existing database does not match the supported legacy schema for ' +
      bridge.migrationNames.join(', ') + details);
  }
  // Apply every bridge migration and record its filename atomically in the legacy ledger.
  await db.transaction([
    ...migrations.map(({ sql }) => ({ sql })),
    ...migrations.map(({ record }) => ({
      sql: 'INSERT INTO schema_migrations (filename) VALUES ($1)',
      values: [record.name],
    })),
  ]);
}
async function upgradeLegacyTracker(
  db: MigrationDatabase, columns: ReadonlySet<string>, plan: MigrationPlan,
): Promise<void> {
  const sourceNameColumn = columns.has('filename') ? 'filename' : columns.has('name') ? 'name' : null;
  if (!sourceNameColumn) throw new Error('Unsupported schema_migrations layout; refusing to mutate it');
  const names = await db.queryRows<{ name: string }>(
    'SELECT ' + sourceNameColumn + ' AS name FROM schema_migrations ORDER BY ' + sourceNameColumn,
  );
  const expectedByName = new Map(plan.allRecords.map((record) => [record.name, record]));
  for (const row of names) {
    if (!expectedByName.has(row.name)) {
      throw new Error('Legacy schema_migrations contains unknown entry ' + row.name + '; refusing to continue');
    }
  }
  const statements: SqlStatement[] = [
    { sql: 'ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS name TEXT' },
    { sql: 'ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum TEXT' },
    { sql: 'ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS origin TEXT' },
  ];
  if (columns.has('filename')) {
    statements.push({ sql: 'UPDATE schema_migrations SET name = COALESCE(name, filename)' });
  }
  statements.push({
    sql: 'CREATE UNIQUE INDEX IF NOT EXISTS schema_migrations_name_uidx ON schema_migrations(name)',
  });
  for (const row of names) {
    const record = expectedByName.get(row.name)!;
    statements.push({
      sql: 'UPDATE schema_migrations SET checksum = $2, origin = $3 WHERE name = $1',
      values: [row.name, record.checksum, record.origin],
    });
  }
  statements.push(
    { sql: [
      'DO $$ BEGIN',
      " IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schema_migrations_origin_check' AND conrelid = 'schema_migrations'::regclass) THEN",
      "  ALTER TABLE schema_migrations ADD CONSTRAINT schema_migrations_origin_check CHECK (origin IN ('baseline', 'migration'));",
      ' END IF;',
      'END $$',
    ].join('\n') },
    { sql: 'ALTER TABLE schema_migrations ALTER COLUMN name SET NOT NULL' },
    { sql: 'ALTER TABLE schema_migrations ALTER COLUMN checksum SET NOT NULL' },
    { sql: 'ALTER TABLE schema_migrations ALTER COLUMN origin SET NOT NULL' },
  );
  await db.transaction(statements);
}

/**
 * Empty databases are bootstrapped from the canonical final schema.sql.
 * Historical 001–023 files are checksum-recorded as baseline history, never
 * executed against that final schema. Existing databases are only marked after
 * a comparator proves structural equivalence.
 */
export async function runMigrations(db: MigrationDatabase, options: RunMigrationsOptions): Promise<void> {
  const plan = options.plan;
  let trackerExists = await hasTracker(db);
  let columns = trackerExists ? await trackerColumns(db) : new Set<string>();
  let legacyFilenameColumn = columns.has('filename');
  const objectCount = await userObjectCount(db);
  const isEmpty = objectCount === 0;

  if (trackerExists && (!columns.has('name') || !columns.has('checksum') || !columns.has('origin'))) {
    if (isEmpty) {
      const legacyRows = (columns.has('filename') || columns.has('name'))
        ? await db.queryRows<{ name: string }>(
          'SELECT ' + (columns.has('filename') ? 'filename' : 'name') + ' AS name FROM schema_migrations',
        )
        : [];
      if (legacyRows.length > 0) {
        throw new Error('Empty database has non-empty legacy migration metadata; refusing to bootstrap');
      }
    } else {
      const comparison = await compareExisting(options.compareExistingSchema);
      if (!comparison.equivalent) {
        if (!options.legacySchemaBridge) {
          assertComparisonEquivalent(comparison);
        } else {
          await applyLegacySchemaBridge(db, columns, plan, options.legacySchemaBridge);
          await assertEquivalent(options.compareExistingSchema);
        }
      }
    }
    await upgradeLegacyTracker(db, columns, plan);
    columns = await trackerColumns(db);
    trackerExists = true;
    legacyFilenameColumn = columns.has('filename');
  }

  let applied = trackerExists ? await currentRecords(db, columns) : [];
  assertRecordedChecksums(applied, plan.allRecords);

  if (!trackerExists) {
    if (isEmpty) {
      await db.transaction([
        { sql: createTrackerSql() },
        { sql: plan.baselineSchemaSql },
        ...plan.baselineRecords.map((record) => makeInsert(record, false)),
      ]);
      trackerExists = true;
      columns = await trackerColumns(db);
      legacyFilenameColumn = columns.has('filename');
      applied = await currentRecords(db, columns);
    } else {
      await assertEquivalent(options.compareExistingSchema);
      await db.transaction([
        { sql: createTrackerSql() },
        ...plan.baselineRecords.map((record) => makeInsert(record, false)),
      ]);
      trackerExists = true;
      columns = await trackerColumns(db);
      legacyFilenameColumn = columns.has('filename');
      applied = await currentRecords(db, columns);
    }
  } else {
    if (isEmpty && applied.length > 0) {
      throw new Error('Empty database has applied migration metadata; refusing to replay or repair baseline');
    }
    if (isEmpty) {
      await db.transaction([
        { sql: plan.baselineSchemaSql },
        ...plan.baselineRecords.map((record) => makeInsert(record, legacyFilenameColumn)),
      ]);
      applied = await currentRecords(db, columns);
    } else {
      const appliedNames = new Set(applied.map((record) => record.name));
      const missingBaseline = plan.baselineRecords.filter((record) => !appliedNames.has(record.name));
      if (missingBaseline.length > 0) {
        await assertEquivalent(options.compareExistingSchema);
        await db.transaction(missingBaseline.map((record) => makeInsert(record, legacyFilenameColumn)));
        applied = await currentRecords(db, columns);
      }
    }
  }

  const appliedNames = new Set(applied.map((record) => record.name));
  for (const migration of plan.migrations) {
    if (appliedNames.has(migration.record.name)) continue;
    await db.transaction([
      { sql: migration.sql },
      makeInsert(migration.record, legacyFilenameColumn),
    ]);
    appliedNames.add(migration.record.name);
  }
}
