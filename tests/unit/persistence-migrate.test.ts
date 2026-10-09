import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { assertRecordedChecksums, loadMigrationPlan } from '../../packages/persistence/src/migrate.js';

const expected = [
  { name: 'schema.sql', checksum: 'a'.repeat(64), origin: 'baseline' as const },
  { name: '024_add_example.sql', checksum: 'b'.repeat(64), origin: 'migration' as const },
];
const rootDir = fileURLToPath(new URL('../../', import.meta.url));

describe('forward-only migration metadata', () => {
  test('rejects a changed checksum before applying SQL', () => {
    expect(() => assertRecordedChecksums(
      [{ name: '024_add_example.sql', checksum: 'c'.repeat(64), origin: 'migration' }],
      expected,
    )).toThrow(/checksum changed/i);
  });
  test('rejects origin changes and unknown recorded migrations', () => {
    expect(() => assertRecordedChecksums(
      [{ name: 'schema.sql', checksum: 'a'.repeat(64), origin: 'migration' }],
      expected,
    )).toThrow(/origin changed/i);
    expect(() => assertRecordedChecksums(
      [{ name: '003_removed.sql', checksum: 'd'.repeat(64), origin: 'baseline' }],
      expected,
    )).toThrow(/unknown applied migration/i);
  });
  test('loads canonical schema plus 23 immutable historical migration checksums', async () => {
    const plan = await loadMigrationPlan(rootDir);
    expect(plan.baselineRecords).toHaveLength(24);
    expect(plan.baselineRecords[0]?.name).toBe('schema.sql');
    const historical = plan.baselineRecords.slice(1);
    expect(historical).toHaveLength(23);
    historical.forEach((record, index) => {
      expect(record.name.startsWith(String(index + 1).toString().padStart(3, '0') + '_')).toBe(true);
      expect(record.origin).toBe('baseline');
      expect(record.checksum).toMatch(/^[a-f0-9]{64}$/);
    });
  });
  test('documents exact SHA-256 checksums of all immutable baseline files', async () => {
    const plan = await loadMigrationPlan(rootDir);
    const report = await readFile(path.join(rootDir, 'docs', 'DB-BASELINE.md'), 'utf8');
    for (const record of plan.baselineRecords) {
      const filePath = record.name === 'schema.sql'
        ? path.join(rootDir, 'db', 'baseline', record.name)
        : path.join(rootDir, 'db', 'baseline', record.name);
      const actual = createHash('sha256').update(await readFile(filePath)).digest('hex');
      expect(record.checksum).toBe(actual);
      const row = report.split('\n').find((line) => line.startsWith('| ' + record.name + ' |'));
      expect(row, 'missing checksum row for ' + record.name).toContain(record.checksum);
    }
  });
});
