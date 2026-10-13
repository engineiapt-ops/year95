import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

function checksum(content) {
  return createHash('sha256').update(content).digest('hex');
}
async function readSqlFile(absolutePath, name, origin) {
  const bytes = await readFile(absolutePath);
  return {
    record: { name, checksum: checksum(bytes), origin },
    sql: bytes.toString('utf8'),
  };
}
export async function loadMigrationPlan(rootDir) {
  const baselineDir = path.join(rootDir, 'db', 'baseline');
  const migrationDir = path.join(rootDir, 'db', 'migrations');
  const baselineNames = (await readdir(baselineDir))
    .filter((name) => /^\d{3}_[A-Za-z0-9_-]+\.sql$/.test(name))
    .sort();
  if (baselineNames.length !== 23) {
    throw new Error('Expected 23 immutable baseline migrations; found ' + baselineNames.length);
  }
  baselineNames.forEach((name, index) => {
    const prefix = String(index + 1).padStart(3, '0') + '_';
    if (!name.startsWith(prefix)) throw new Error('Baseline sequence is incomplete at ' + prefix);
  });
  const schemaEntry = await readSqlFile(
    path.join(baselineDir, 'schema.sql'),
    'schema.sql',
    'baseline',
  );
  const schemaCorrectionsEntry = await readSqlFile(
    path.join(baselineDir, 'schema-corrections.sql'),
    'schema-corrections.sql',
    'baseline',
  );
  const baselineFiles = await Promise.all(
    baselineNames.map((name) => readSqlFile(path.join(baselineDir, name), name, 'baseline')),
  );
  const migrationNames = (await readdir(migrationDir))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  let previousNumber = 23;
  for (const name of migrationNames) {
    const match = name.match(/^(\d{3,})_[A-Za-z0-9_-]+\.sql$/);
    if (!match || Number(match[1]) < 24) {
      throw new Error('New migrations must use the 024+ naming scheme: ' + name);
    }
    const number = Number(match[1]);
    if (number !== previousNumber + 1)
      throw new Error('Migration sequence has a gap before ' + name);
    previousNumber = number;
  }
  const migrations = await Promise.all(
    migrationNames.map(async (name) => {
      const migration = await readSqlFile(path.join(migrationDir, name), name, 'migration');
      return { record: migration.record, sql: migration.sql };
    }),
  );
  const baselineRecords = [
    schemaEntry.record,
    schemaCorrectionsEntry.record,
    ...baselineFiles.map((file) => file.record),
  ];
  migrations.sort((left, right) => left.record.name.localeCompare(right.record.name));
  return {
    baselineSchemaSql: schemaEntry.sql,
    baselineCorrectionsSql: schemaCorrectionsEntry.sql,
    baselineRecords,
    migrations,
    allRecords: [...baselineRecords, ...migrations.map(({ record }) => record)],
  };
}
