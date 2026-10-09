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
      .map(({ name }) => name.match(/^(\\d{3})_/))
      .map((match, index) => ({ match, name: plan.baselineRecords[index]?.name }))
      .filter(({ match }) => match !== null && Number(match[1]) <= 18)
      .map(({ name }) => name)
      .filter((name) => typeof name === 'string');
    legacySchemaBridge = {
      migrationName: '024_add_instruments.sql',
      expectedAppliedNames,
      compareSchema: async () => {
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
