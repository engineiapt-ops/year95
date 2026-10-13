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

export type SchemaFingerprintCategory = keyof SchemaFingerprint;
export type SchemaDifferenceType =
  'extra in database' | 'missing in database' | 'definition different';

export interface SchemaObjectDifference {
  category: SchemaFingerprintCategory;
  object: string;
  differenceType: SchemaDifferenceType;
  changedFields?: readonly string[];
}

/**
 * Versioned, narrow live-schema allowance sourced from migration 027.
 *
 * Only these tables and their table/column/constraint/index objects may be an
 * expected addition over the historical canonical baseline. Their live
 * definitions are still compared with a fingerprint produced by applying
 * db/migrations/027_add_identity_repository_tables.sql. Triggers are not
 * excluded; any trigger difference remains unexpected.
 */
export const EXPECTED_LIVE_SCHEMA_VARIATIONS_V1 = Object.freeze({
  name: 'identity-repository-tables',
  version: 1,
  source: 'db/migrations/027_add_identity_repository_tables.sql',
  tables: ['allowed_emails', 'user_profiles'] as const,
  categories: ['tables', 'columns', 'constraints', 'indexes'] as const,
});

export interface LiveSchemaDifferenceReport {
  policy: {
    name: string;
    version: number;
    source: string;
    tables: readonly string[];
  };
  expected: readonly SchemaObjectDifference[];
  unexpected: readonly SchemaObjectDifference[];
  expectedCount: number;
  unexpectedCount: number;
  equivalent: boolean;
}

const SCHEMA_FINGERPRINT_CATEGORIES: readonly SchemaFingerprintCategory[] = [
  'tables',
  'columns',
  'constraints',
  'indexes',
  'triggers',
];

const OBJECT_KEY_FIELDS: Record<SchemaFingerprintCategory, readonly string[]> = {
  tables: ['table_name'],
  columns: ['table_name', 'column_name'],
  constraints: ['table_name', 'constraint_name'],
  indexes: ['table_name', 'index_name'],
  triggers: ['table_name', 'trigger_name'],
};

function getObjectKey(category: SchemaFingerprintCategory, row: Record<string, unknown>): string {
  return OBJECT_KEY_FIELDS[category].map((field) => String(row[field] ?? '<missing>')).join('.');
}

function getObjectLabel(category: SchemaFingerprintCategory, row: Record<string, unknown>): string {
  return OBJECT_KEY_FIELDS[category].map((field) => String(row[field] ?? '<missing>')).join('.');
}

function sameFingerprintValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function changedFields(
  category: SchemaFingerprintCategory,
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
): string[] {
  const identityFields = new Set(OBJECT_KEY_FIELDS[category]);
  const fields = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  return [...fields]
    .filter((field) => !identityFields.has(field))
    .filter((field) => !sameFingerprintValue(expected[field], actual[field]))
    .sort();
}

function diffCategoryObjects(
  category: SchemaFingerprintCategory,
  expectedRows: readonly Record<string, unknown>[],
  actualRows: readonly Record<string, unknown>[],
): SchemaObjectDifference[] {
  const expectedByKey = new Map(expectedRows.map((row) => [getObjectKey(category, row), row]));
  const actualByKey = new Map(actualRows.map((row) => [getObjectKey(category, row), row]));
  const differences: SchemaObjectDifference[] = [];

  for (const [key, expected] of expectedByKey) {
    const actual = actualByKey.get(key);
    if (!actual) {
      differences.push({
        category,
        object: getObjectLabel(category, expected),
        differenceType: 'missing in database',
      });
      continue;
    }
    const fields = changedFields(category, expected, actual);
    if (fields.length > 0) {
      differences.push({
        category,
        object: getObjectLabel(category, actual),
        differenceType: 'definition different',
        changedFields: fields,
      });
    }
  }

  for (const [key, actual] of actualByKey) {
    if (!expectedByKey.has(key)) {
      differences.push({
        category,
        object: getObjectLabel(category, actual),
        differenceType: 'extra in database',
      });
    }
  }

  return differences.sort(
    (left, right) =>
      left.object.localeCompare(right.object) ||
      left.differenceType.localeCompare(right.differenceType),
  );
}

function filterFingerprint(
  fingerprint: SchemaFingerprint,
  keepRow: (category: SchemaFingerprintCategory, row: Record<string, unknown>) => boolean,
): SchemaFingerprint {
  return {
    tables: fingerprint.tables.filter((row) => keepRow('tables', row)),
    columns: fingerprint.columns.filter((row) => keepRow('columns', row)),
    constraints: fingerprint.constraints.filter((row) => keepRow('constraints', row)),
    indexes: fingerprint.indexes.filter((row) => keepRow('indexes', row)),
    triggers: fingerprint.triggers.filter((row) => keepRow('triggers', row)),
  };
}

function collectFingerprintDifferences(
  expected: SchemaFingerprint,
  actual: SchemaFingerprint,
): SchemaObjectDifference[] {
  return SCHEMA_FINGERPRINT_CATEGORIES.flatMap((category) =>
    diffCategoryObjects(category, expected[category], actual[category]),
  );
}

/**
 * Compares the canonical live schema while accepting only the exact additions
 * produced by migration 027. The migration-derived identity fingerprint must be
 * supplied separately so definition drift in either identity table still fails.
 */
export function compareLiveSchemaFingerprints(
  canonicalExpected: SchemaFingerprint,
  liveActual: SchemaFingerprint,
  migration027Expected: SchemaFingerprint,
): LiveSchemaDifferenceReport {
  const identityTables = new Set<string>(EXPECTED_LIVE_SCHEMA_VARIATIONS_V1.tables);
  const expectedCategories = new Set<SchemaFingerprintCategory>(
    EXPECTED_LIVE_SCHEMA_VARIATIONS_V1.categories,
  );

  // Keep the existing canonical comparison exact for all non-identity objects.
  // Triggers are deliberately never filtered, even when attached to an identity table.
  const canonicalExpectedFiltered = filterFingerprint(
    canonicalExpected,
    (category, row) => category === 'triggers' || !identityTables.has(String(row.table_name ?? '')),
  );
  const liveActualFiltered = filterFingerprint(
    liveActual,
    (category, row) => category === 'triggers' || !identityTables.has(String(row.table_name ?? '')),
  );
  const unexpected: SchemaObjectDifference[] = collectFingerprintDifferences(
    canonicalExpectedFiltered,
    liveActualFiltered,
  );

  // Treat migration 027 itself as the source of truth for the two expected tables.
  // This detects missing tables/columns/constraints/indexes and any definition drift.
  const identityExpected = filterFingerprint(
    migration027Expected,
    (category, row) =>
      expectedCategories.has(category) && identityTables.has(String(row.table_name ?? '')),
  );
  const identityActual = filterFingerprint(
    liveActual,
    (category, row) =>
      expectedCategories.has(category) && identityTables.has(String(row.table_name ?? '')),
  );
  const identityDifferences = collectFingerprintDifferences(identityExpected, identityActual);
  unexpected.push(...identityDifferences);

  // An object is EXPECTED only if it is part of migration 027's fingerprint and
  // exists in production with the exact same definition. No values from rows or
  // definitions are copied into this report; only object names and changed fields.
  const expected: SchemaObjectDifference[] = [];
  for (const category of EXPECTED_LIVE_SCHEMA_VARIATIONS_V1.categories) {
    const canonicalRows = canonicalExpected[category];
    const canonicalKeys = new Set(canonicalRows.map((row) => getObjectKey(category, row)));
    const templateRows = identityExpected[category];
    const liveRows = new Map(liveActual[category].map((row) => [getObjectKey(category, row), row]));

    for (const template of templateRows) {
      const key = getObjectKey(category, template);
      if (canonicalKeys.has(key)) continue;
      const actual = liveRows.get(key);
      if (!actual) continue;
      if (changedFields(category, template, actual).length > 0) continue;
      expected.push({
        category,
        object: getObjectLabel(category, actual),
        differenceType: 'extra in database',
      });
    }
  }

  expected.sort(
    (left, right) =>
      left.category.localeCompare(right.category) || left.object.localeCompare(right.object),
  );
  unexpected.sort(
    (left, right) =>
      left.category.localeCompare(right.category) ||
      left.object.localeCompare(right.object) ||
      left.differenceType.localeCompare(right.differenceType),
  );

  return {
    policy: {
      name: EXPECTED_LIVE_SCHEMA_VARIATIONS_V1.name,
      version: EXPECTED_LIVE_SCHEMA_VARIATIONS_V1.version,
      source: EXPECTED_LIVE_SCHEMA_VARIATIONS_V1.source,
      tables: EXPECTED_LIVE_SCHEMA_VARIATIONS_V1.tables,
    },
    expected,
    unexpected,
    expectedCount: expected.length,
    unexpectedCount: unexpected.length,
    equivalent: unexpected.length === 0,
  };
}
