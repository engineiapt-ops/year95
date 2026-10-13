import type { MigrationDatabase } from './migrate.js';

export interface SchemaFingerprint {
  tables: readonly Record<string, unknown>[];
  columns: readonly Record<string, unknown>[];
  constraints: readonly Record<string, unknown>[];
  indexes: readonly Record<string, unknown>[];
  triggers: readonly Record<string, unknown>[];
}
export interface SchemaFingerprintComparison {
  equivalent: boolean;
  differences: readonly string[];
  expected: SchemaFingerprint;
  actual: SchemaFingerprint;
}
function normalizeSchemaName<T>(value: T, schemaName: string): T {
  if (typeof value === 'string') return value.split(schemaName).join('$SCHEMA') as T;
  if (Array.isArray(value)) return value.map((item) => normalizeSchemaName(item, schemaName)) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, normalizeSchemaName(child, schemaName)]),
    ) as T;
  }
  return value;
}
export async function schemaFingerprint(
  db: MigrationDatabase,
  schemaName: string,
): Promise<SchemaFingerprint> {
  const tables = await db.queryRows(
    [
      'SELECT table_name, table_type FROM information_schema.tables',
      "WHERE table_schema = $1 AND table_name <> 'schema_migrations'",
      'ORDER BY table_name, table_type',
    ].join(' '),
    [schemaName],
  );
  // Column ordinal is deliberately ignored: ALTER TABLE ADD COLUMN appends fields,
  // while named-column semantics are unchanged. Compare full definitions by name.
  const columns = await db.queryRows(
    [
      'SELECT table_name, column_name, column_default, is_nullable, data_type,',
      'udt_name, character_maximum_length, numeric_precision, numeric_scale, datetime_precision,',
      'is_identity, identity_generation, is_generated, generation_expression',
      "FROM information_schema.columns WHERE table_schema = $1 AND table_name <> 'schema_migrations'",
      'ORDER BY table_name, column_name',
    ].join(' '),
    [schemaName],
  );
  const constraints = await db.queryRows(
    [
      'SELECT table_relation.relname AS table_name, constraint_record.conname AS constraint_name,',
      'constraint_record.contype::text AS constraint_type,',
      'pg_get_constraintdef(constraint_record.oid, true) AS definition,',
      'constraint_record.condeferrable AS is_deferrable, constraint_record.condeferred AS initially_deferred,',
      'constraint_record.convalidated AS is_validated',
      'FROM pg_constraint AS constraint_record',
      'JOIN pg_class AS table_relation ON table_relation.oid = constraint_record.conrelid',
      'JOIN pg_namespace AS schema_record ON schema_record.oid = table_relation.relnamespace',
      "WHERE schema_record.nspname = $1 AND table_relation.relname <> 'schema_migrations'",
      'ORDER BY table_relation.relname, constraint_record.conname',
    ].join(' '),
    [schemaName],
  );
  const indexes = await db.queryRows(
    [
      'SELECT tablename AS table_name, indexname AS index_name, indexdef AS definition FROM pg_indexes',
      "WHERE schemaname = $1 AND tablename <> 'schema_migrations' ORDER BY tablename, indexname",
    ].join(' '),
    [schemaName],
  );
  const triggers = await db.queryRows(
    [
      'SELECT table_relation.relname AS table_name, trigger_record.tgname AS trigger_name,',
      'pg_get_triggerdef(trigger_record.oid, true) AS trigger_definition, trigger_record.tgenabled AS enabled,',
      'function_record.proname AS function_name, pg_get_functiondef(function_record.oid) AS function_definition',
      'FROM pg_trigger AS trigger_record',
      'JOIN pg_class AS table_relation ON table_relation.oid = trigger_record.tgrelid',
      'JOIN pg_namespace AS schema_record ON schema_record.oid = table_relation.relnamespace',
      'JOIN pg_proc AS function_record ON function_record.oid = trigger_record.tgfoid',
      "WHERE schema_record.nspname = $1 AND NOT trigger_record.tgisinternal AND table_relation.relname <> 'schema_migrations'",
      'ORDER BY table_relation.relname, trigger_record.tgname',
    ].join(' '),
    [schemaName],
  );
  // A security migration may pin a trigger function to the inert pg_catalog-only
  // search path. PostgreSQL includes that SET clause in pg_get_functiondef(), but
  // it is runtime configuration rather than a change to the trigger's executable
  // body. Strip only this exact approved clause; compare every other function line.
  const normalizedTriggers = triggers.map((trigger) => {
    const definition = trigger.function_definition;
    if (typeof definition !== 'string') return trigger;
    return {
      ...trigger,
      function_definition: definition.replace(
        /\n\s*SET search_path\s+(?:TO|=)\s*(?:'pg_catalog'|"pg_catalog"|pg_catalog)\s*\n/g,
        '\n',
      ),
    };
  });
  return normalizeSchemaName(
    {
      tables,
      columns,
      constraints,
      indexes,
      triggers: normalizedTriggers,
    },
    schemaName,
  ) as SchemaFingerprint;
}
function filterExcludedTables(
  fingerprint: SchemaFingerprint,
  excludedTableNames: ReadonlySet<string>,
): SchemaFingerprint {
  const retain = (rows: readonly Record<string, unknown>[]) =>
    rows.filter(
      (row) => typeof row.table_name !== 'string' || !excludedTableNames.has(row.table_name),
    );
  return {
    tables: retain(fingerprint.tables),
    columns: retain(fingerprint.columns),
    constraints: retain(fingerprint.constraints),
    indexes: retain(fingerprint.indexes),
    triggers: retain(fingerprint.triggers),
  };
}
function compareFingerprints(
  expected: SchemaFingerprint,
  actual: SchemaFingerprint,
): SchemaFingerprintComparison {
  const differences = (Object.keys(expected) as (keyof SchemaFingerprint)[]).filter(
    (category) => JSON.stringify(expected[category]) !== JSON.stringify(actual[category]),
  );
  return { equivalent: differences.length === 0, differences, expected, actual };
}
export async function compareSchemaFingerprints(
  expectedDb: MigrationDatabase,
  actualDb: MigrationDatabase,
  expectedSchema: string,
  actualSchema: string,
): Promise<SchemaFingerprintComparison> {
  const [expected, actual] = await Promise.all([
    schemaFingerprint(expectedDb, expectedSchema),
    schemaFingerprint(actualDb, actualSchema),
  ]);
  return compareFingerprints(expected, actual);
}

/**
 * Compares a known legacy state with the canonical schema while ignoring only
 * explicitly named tables. This is intended for narrow, preflighted compatibility
 * bridges—not as a replacement for the exact final-schema comparison.
 */
export async function compareSchemaFingerprintsIgnoringTables(
  expectedDb: MigrationDatabase,
  actualDb: MigrationDatabase,
  expectedSchema: string,
  actualSchema: string,
  excludedTableNames: readonly string[],
): Promise<SchemaFingerprintComparison> {
  if (excludedTableNames.length === 0) {
    return compareSchemaFingerprints(expectedDb, actualDb, expectedSchema, actualSchema);
  }
  const [expected, actual] = await Promise.all([
    schemaFingerprint(expectedDb, expectedSchema),
    schemaFingerprint(actualDb, actualSchema),
  ]);
  const excluded = new Set(excludedTableNames);
  return compareFingerprints(
    filterExcludedTables(expected, excluded),
    filterExcludedTables(actual, excluded),
  );
}

/**
 * Compares a known legacy state while excluding only explicitly named missing tables
 * and indexes. All other fingerprint categories remain exact, so this cannot hide
 * unrelated schema drift.
 */
export async function compareSchemaFingerprintsIgnoringTablesAndIndexes(
  expectedDb: MigrationDatabase,
  actualDb: MigrationDatabase,
  expectedSchema: string,
  actualSchema: string,
  excludedTableNames: readonly string[],
  excludedIndexNames: readonly string[],
): Promise<SchemaFingerprintComparison> {
  const [expected, actual] = await Promise.all([
    schemaFingerprint(expectedDb, expectedSchema),
    schemaFingerprint(actualDb, actualSchema),
  ]);
  const excludedTables = new Set(excludedTableNames);
  const excludedIndexes = new Set(excludedIndexNames);
  const filterKnownMissingObjects = (fingerprint: SchemaFingerprint): SchemaFingerprint => {
    const tablesFiltered = filterExcludedTables(fingerprint, excludedTables);
    return {
      ...tablesFiltered,
      indexes: tablesFiltered.indexes.filter(
        (row) => typeof row.index_name !== 'string' || !excludedIndexes.has(row.index_name),
      ),
    };
  };
  return compareFingerprints(
    filterKnownMissingObjects(expected),
    filterKnownMissingObjects(actual),
  );
}
