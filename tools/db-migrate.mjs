/* global URL, console, process */
import { fileURLToPath } from 'node:url';
import { PsqlDatabaseClient } from './postgres-client.mjs';
import { loadMigrationPlan } from './migration-files.mjs';
import {
  compareSchemaFingerprints,
  compareSchemaFingerprintsIgnoringTablesAndIndexes,
} from '../packages/persistence/dist/schema-fingerprint.js';
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

    // Permit exactly the observed pre-recovery state: historical filename ledger
    // through 018, with only instruments and the historical paper-idempotency
    // index missing. Any other structural drift must fail closed.
    const expectedAppliedNames = plan.baselineRecords
      .map(({ name }) => name)
      .filter((name) => /^[0-9]{3}_/.test(name) && Number(name.slice(0, 3)) <= 18);
    legacySchemaBridge = {
      migrationNames: [
        '024_add_instruments.sql',
        '025_add_decision_log_paper_idempotency.sql',
      ],
      expectedAppliedNames,
      compareSchema: async () => {
        const instrumentTable = await targetReadOnly.queryRows(
          "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'instruments' AND table_type = 'BASE TABLE') AS exists",
          ['public'],
        );
        if (instrumentTable[0]?.exists === true) {
          return { equivalent: false, differences: ['instruments must be absent for the supported recovery path'] };
        }
        const idempotencyIndex = await targetReadOnly.queryRows(
          'SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = $1 AND indexname = $2) AS exists',
          ['public', 'idx_decision_log_paper_idempotency'],
        );
        if (idempotencyIndex[0]?.exists === true) {
          return {
            equivalent: false,
            differences: ['idx_decision_log_paper_idempotency must be absent for the supported recovery path'],
          };
        }
        const comparison = await compareSchemaFingerprintsIgnoringTablesAndIndexes(
          referenceDb,
          targetReadOnly,
          'public',
          'public',
          ['instruments'],
          ['idx_decision_log_paper_idempotency'],
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
