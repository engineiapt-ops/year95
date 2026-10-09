import { fileURLToPath } from 'node:url';
import { PsqlDatabaseClient } from './postgres-client.mjs';
import { compareSchemaFingerprints } from '../packages/persistence/dist/schema-fingerprint.js';
import { runMigrations } from '../packages/persistence/dist/migrate.js';

async function main() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const db = new PsqlDatabaseClient({ connectionString });
  const referenceUrl = process.env.DB_BASELINE_REFERENCE_URL?.trim();
  let compareExistingSchema;
  if (referenceUrl) {
    compareExistingSchema = async () => {
      const referenceDb = new PsqlDatabaseClient({ connectionString: referenceUrl, readOnly: true });
      const targetReadOnly = new PsqlDatabaseClient({ connectionString, readOnly: true });
      const comparison = await compareSchemaFingerprints(referenceDb, targetReadOnly, 'public', 'public');
      return { equivalent: comparison.equivalent, differences: comparison.differences };
    };
  }
  const rootDir = fileURLToPath(new URL('..', import.meta.url));
  await runMigrations(db, { rootDir, compareExistingSchema });
  console.log('YEAR95 migrations concluídas.');
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
