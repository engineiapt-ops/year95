/* global URL, console, process */
import { fileURLToPath } from 'node:url';
import { PsqlDatabaseClient } from './postgres-client.mjs';
import { loadMigrationPlan } from './migration-files.mjs';
import { compareSchemaFingerprints, compareSchemaFingerprintsIgnoringTables } from '../packages/persistence/dist/schema-fingerprint.js';
import { runMigrations } from '../packages/persistence/dist/migrate.js';

async function main() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const db = new PsqlDatabaseClient({ connectionString });
  const rootDir = fileURLToPath(new URL('..', import.meta.url));
  const plan = await loadMigrationPlan(rootDir);
  const referenceUrl = process.env.DB_BASELINE_REFERENCE_URL?.trim();
  let compareExistingSchema;
  let legacySchemaBridge;
  if (referenceUrl) {
    const referenceDb = new PsqlDatabaseClient({ connectionString: referenceUrl, readOnly: true });
    const targetReadOnly = new PsqlDatabaseClient({ connectionString, readOnly: true });
    compareExistingSchema = async () => {
      const comparison = await compareSchemaFingerprints(referenceDb, targetReadOnly, 'public', 'public');
      return { equivalent: comparison.equivalent, differences: comparison.differences };
    };

    // Permit exactly the known pre-024 production state: historical filename
    // ledger through 018, with all canonical objects except instruments. The
    // bridge comparator ignores only that table and its indexes/constraints.
    const expectedAppliedNames = plan.baselineRecords
      .map(({ name }) => name)
      .filter((name) => /^[0-9]{3}_/.test(name) && Number(name.slice(0, 3)) <= 18);
    legacySchemaBridge = {
      migrationName: '024_add_instruments.sql',
      expectedAppliedNames,
      compareSchema: async () => {
        const instrumentTable = await targetReadOnly.queryRows(
          "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'instruments' AND table_type = 'BASE TABLE') AS exists",
          ['public'],
        );
        if (instrumentTable[0]?.exists === true) {
          return { equivalent: false, differences: ['instruments must be absent for the supported 024 bridge'] };
        }
        const comparison = await compareSchemaFingerprintsIgnoringTables(
          referenceDb, targetReadOnly, 'public', 'public', ['instruments'],
        );
        return { equivalent: comparison.equivalent, differences: comparison.differences };
      },
    };
  }
  await runMigrations(db, { plan, compareExistingSchema, legacySchemaBridge });
  console.log('YEAR95 migrations concluídas.');
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
