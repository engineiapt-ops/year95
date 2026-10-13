import { describe, expect, test } from 'vitest';
import {
  compareLiveSchemaFingerprints,
  EXPECTED_LIVE_SCHEMA_VARIATIONS_V1,
  type SchemaFingerprint,
} from '../../packages/persistence/src/schema-fingerprint.js';

const canonical: SchemaFingerprint = {
  tables: [{ table_name: 'market_data', table_type: 'BASE TABLE' }],
  columns: [
    {
      table_name: 'market_data',
      column_name: 'symbol',
      data_type: 'text',
      is_nullable: 'NO',
      column_default: null,
    },
  ],
  constraints: [],
  indexes: [],
  triggers: [],
};

const migration027Identity: SchemaFingerprint = {
  tables: [
    { table_name: 'allowed_emails', table_type: 'BASE TABLE' },
    { table_name: 'user_profiles', table_type: 'BASE TABLE' },
  ],
  columns: [
    {
      table_name: 'allowed_emails',
      column_name: 'email',
      data_type: 'text',
      is_nullable: 'NO',
      column_default: null,
    },
    {
      table_name: 'allowed_emails',
      column_name: 'created_at',
      data_type: 'timestamp with time zone',
      is_nullable: 'NO',
      column_default: 'now()',
    },
    {
      table_name: 'user_profiles',
      column_name: 'user_id',
      data_type: 'uuid',
      is_nullable: 'NO',
      column_default: null,
    },
    {
      table_name: 'user_profiles',
      column_name: 'display_name',
      data_type: 'text',
      is_nullable: 'YES',
      column_default: null,
    },
    {
      table_name: 'user_profiles',
      column_name: 'created_at',
      data_type: 'timestamp with time zone',
      is_nullable: 'NO',
      column_default: 'now()',
    },
    {
      table_name: 'user_profiles',
      column_name: 'updated_at',
      data_type: 'timestamp with time zone',
      is_nullable: 'NO',
      column_default: 'now()',
    },
  ],
  constraints: [
    {
      table_name: 'allowed_emails',
      constraint_name: 'allowed_emails_email_normalized',
      constraint_type: 'c',
      definition: "CHECK (email = lower(btrim(email)) AND email <> ''::text)",
      is_validated: true,
    },
    {
      table_name: 'allowed_emails',
      constraint_name: 'allowed_emails_pkey',
      constraint_type: 'p',
      definition: 'PRIMARY KEY (email)',
      is_validated: true,
    },
    {
      table_name: 'user_profiles',
      constraint_name: 'user_profiles_pkey',
      constraint_type: 'p',
      definition: 'PRIMARY KEY (user_id)',
      is_validated: true,
    },
    {
      table_name: 'user_profiles',
      constraint_name: 'user_profiles_user_id_fkey',
      constraint_type: 'f',
      definition: 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE',
      is_validated: true,
    },
  ],
  indexes: [
    {
      table_name: 'allowed_emails',
      index_name: 'allowed_emails_pkey',
      definition: 'CREATE UNIQUE INDEX allowed_emails_pkey ON $SCHEMA.allowed_emails USING btree (email)',
    },
    {
      table_name: 'user_profiles',
      index_name: 'user_profiles_pkey',
      definition: 'CREATE UNIQUE INDEX user_profiles_pkey ON $SCHEMA.user_profiles USING btree (user_id)',
    },
  ],
  triggers: [],
};

function withIdentityTables(): SchemaFingerprint {
  return {
    tables: [...canonical.tables, ...migration027Identity.tables],
    columns: [...canonical.columns, ...migration027Identity.columns],
    constraints: [...canonical.constraints, ...migration027Identity.constraints],
    indexes: [...canonical.indexes, ...migration027Identity.indexes],
    triggers: [...canonical.triggers, ...migration027Identity.triggers],
  };
}

function removeIdentityTable(
  fingerprint: SchemaFingerprint,
  tableName: string,
): SchemaFingerprint {
  const retain = (rows: readonly Record<string, unknown>[]) =>
    rows.filter((row) => row.table_name !== tableName);
  return {
    tables: retain(fingerprint.tables),
    columns: retain(fingerprint.columns),
    constraints: retain(fingerprint.constraints),
    indexes: retain(fingerprint.indexes),
    triggers: retain(fingerprint.triggers),
  };
}

describe('live schema object-level comparison', () => {
  test('accepts only identity objects that exactly match migration 027', () => {
    const report = compareLiveSchemaFingerprints(
      canonical,
      withIdentityTables(),
      migration027Identity,
    );

    expect(report.equivalent).toBe(true);
    expect(report.unexpected).toEqual([]);
    expect(report.expectedCount).toBe(14);
    expect(report.unexpectedCount).toBe(0);
    expect(report.policy).toMatchObject({
      name: EXPECTED_LIVE_SCHEMA_VARIATIONS_V1.name,
      version: 1,
      source: 'db/migrations/027_add_identity_repository_tables.sql',
      tables: ['allowed_emails', 'user_profiles'],
    });
  });

  test('an extra table outside the expected list fails the comparison', () => {
    const live = withIdentityTables();
    live.tables = [...live.tables, { table_name: 'unexpected_table', table_type: 'BASE TABLE' }];

    const report = compareLiveSchemaFingerprints(canonical, live, migration027Identity);

    expect(report.equivalent).toBe(false);
    expect(report.unexpected).toContainEqual({
      category: 'tables',
      object: 'unexpected_table',
      differenceType: 'extra in database',
    });
  });

  test('an extra column inside an expected identity table still fails', () => {
    const live = withIdentityTables();
    live.columns = [
      ...live.columns,
      {
        table_name: 'allowed_emails',
        column_name: 'unexpected_note',
        data_type: 'text',
        is_nullable: 'YES',
        column_default: null,
      },
    ];

    const report = compareLiveSchemaFingerprints(canonical, live, migration027Identity);

    expect(report.equivalent).toBe(false);
    expect(report.unexpected).toContainEqual({
      category: 'columns',
      object: 'allowed_emails.unexpected_note',
      differenceType: 'extra in database',
    });
  });

  test('a missing expected identity table fails and lists the missing objects', () => {
    const live = removeIdentityTable(withIdentityTables(), 'user_profiles');

    const report = compareLiveSchemaFingerprints(canonical, live, migration027Identity);

    expect(report.equivalent).toBe(false);
    expect(report.unexpected).toContainEqual({
      category: 'tables',
      object: 'user_profiles',
      differenceType: 'missing in database',
    });
    expect(report.unexpected.some((item) => item.object.startsWith('user_profiles.'))).toBe(true);
  });

  test('the report lists individual expected and unexpected objects and their difference types', () => {
    const live = withIdentityTables();
    live.columns = [
      ...live.columns.filter(
        (row) => !(row.table_name === 'user_profiles' && row.column_name === 'display_name'),
      ),
      {
        table_name: 'user_profiles',
        column_name: 'display_name',
        data_type: 'character varying',
        is_nullable: 'YES',
        column_default: null,
      },
      {
        table_name: 'market_data',
        column_name: 'unplanned_column',
        data_type: 'text',
        is_nullable: 'YES',
        column_default: null,
      },
    ];

    const report = compareLiveSchemaFingerprints(canonical, live, migration027Identity);

    expect(report.expected).toContainEqual({
      category: 'tables',
      object: 'allowed_emails',
      differenceType: 'extra in database',
    });
    expect(report.unexpected).toContainEqual({
      category: 'columns',
      object: 'user_profiles.display_name',
      differenceType: 'definition different',
      changedFields: ['data_type'],
    });
    expect(report.unexpected).toContainEqual({
      category: 'columns',
      object: 'market_data.unplanned_column',
      differenceType: 'extra in database',
    });
    expect(report.expectedCount).toBe(report.expected.length);
    expect(report.unexpectedCount).toBe(report.unexpected.length);
    expect(report.unexpectedCount).toBeGreaterThan(0);
  });

  test('a trigger on an expected identity table is not excluded', () => {
    const live = withIdentityTables();
    live.triggers = [
      {
        table_name: 'user_profiles',
        trigger_name: 'unplanned_identity_trigger',
        trigger_definition: 'CREATE TRIGGER unplanned_identity_trigger ...',
        enabled: 'O',
        function_name: 'unplanned_identity_trigger_fn',
        function_definition: 'CREATE FUNCTION unplanned_identity_trigger_fn() RETURNS trigger ...',
      },
    ];

    const report = compareLiveSchemaFingerprints(canonical, live, migration027Identity);

    expect(report.equivalent).toBe(false);
    expect(report.unexpected).toContainEqual({
      category: 'triggers',
      object: 'user_profiles.unplanned_identity_trigger',
      differenceType: 'extra in database',
    });
  });
});
