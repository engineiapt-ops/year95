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
export async function schemaFingerprint(db: MigrationDatabase, schemaName: string): Promise<SchemaFingerprint> {
  const tables = await db.queryRows(
    [
      'SELECT table_name, table_type FROM information_schema.tables',
      'WHERE table_schema = $1 AND table_name <> \'schema_migrations\'',
      'ORDER BY table_name, table_type',
    ].join(' '),
    [schemaName],
  );
  const columns = await db.queryRows(
    [
      'SELECT table_name, column_name, ordinal_position, column_default, is_nullable, data_type,',
      'udt_name, character_maximum_length, numeric_precision, numeric_scale, datetime_precision,',
      'is_identity, identity_generation, is_generated, generation_expression',
      'FROM information_schema.columns WHERE table_schema = $1 AND table_name <> \'schema_migrations\'',
      'ORDER BY table_name, ordinal_position',
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
      'WHERE schema_record.nspname = $1 AND table_relation.relname <> \'schema_migrations\'',
      'ORDER BY table_relation.relname, constraint_record.conname',
    ].join(' '),
    [schemaName],
  );
  const indexes = await db.queryRows(
    [
      'SELECT tablename AS table_name, indexname AS index_name, indexdef AS definition FROM pg_indexes',
      'WHERE schemaname = $1 AND tablename <> \'schema_migrations\' ORDER BY tablename, indexname',
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
      'WHERE schema_record.nspname = $1 AND NOT trigger_record.tgisinternal AND table_relation.relname <> \'schema_migrations\'',
      'ORDER BY table_relation.relname, trigger_record.tgname',
    ].join(' '),
    [schemaName],
  );
  return normalizeSchemaName({ tables, columns, constraints, indexes, triggers }, schemaName) as SchemaFingerprint;
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
  const differences = (Object.keys(expected) as (keyof SchemaFingerprint)[]).filter(
    (category) => JSON.stringify(expected[category]) !== JSON.stringify(actual[category]),
  );
  return { equivalent: differences.length === 0, differences, expected, actual };
}
