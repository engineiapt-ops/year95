/* global URL, console, process */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const migrationDir = path.join(rootDir, 'db', 'migrations');
function withoutCommentsAndStringLiterals(sql) {
  return sql
    .replace(/--[^\n\r]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/'(?:''|[^'])*'/g, "''");
}
async function main() {
  const files = (await readdir(migrationDir)).filter((name) => name.endsWith('.sql')).sort();
  let previous = 23;
  for (const file of files) {
    const match = file.match(/^(\d{3,})_[A-Za-z0-9_-]+\.sql$/);
    if (!match) throw new Error('Invalid migration filename: ' + file);
    const number = Number(match[1]);
    if (number < 24) throw new Error('db/migrations is reserved for migrations 024+: ' + file);
    if (number !== previous + 1)
      throw new Error('Forward-only migration sequence has a gap before ' + file);
    previous = number;
    const rawSql = await readFile(path.join(migrationDir, file), 'utf8');
    const sql = withoutCommentsAndStringLiterals(rawSql);
    const destructive = /\\b(?:DROP|TRUNCATE|RENAME)\\b/i;
    if (destructive.test(sql)) {
      const normalizedRawSql = rawSql
        .replace(/--[^\\n\\r]*/g, '')
        .replace(/\\s+/g, ' ')
        .trim();
      const approvedCheckConstraintReplacement =
        file === '029_benchmark_results_estrategia_widen.sql' &&
        normalizedRawSql ===
          "ALTER TABLE public.benchmark_results DROP CONSTRAINT IF EXISTS benchmark_results_estrategia_check; ALTER TABLE public.benchmark_results ADD CONSTRAINT benchmark_results_estrategia_check CHECK (estrategia IN ('baseline', 'baseline_risk', 'buyhold', 'jev'));";
      if (!approvedCheckConstraintReplacement) {
        throw new Error(
          'Destructive DDL is prohibited in ' + file + '. db/baseline is intentionally not scanned.',
        );
      }
    }
  }
  console.log('check:migrations PASS (' + files.length + ' migration(s)); db/baseline excluded.');
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
