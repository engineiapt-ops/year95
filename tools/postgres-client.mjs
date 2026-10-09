import { spawnSync } from 'node:child_process';

function quoteIdentifier(identifier) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) throw new Error('Unsafe PostgreSQL schema identifier');
  return '"' + identifier.replaceAll('"', '""') + '"';
}
function quoteValue(value) {
  if (value === null) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('SQL parameters must be finite numbers');
    return String(value);
  }
  return "'" + String(value).replaceAll("'", "''") + "'";
}
function applyParameters(sql, values = []) {
  let result = sql;
  for (let index = values.length; index >= 1; index -= 1) {
    result = result.replaceAll('$' + index, quoteValue(values[index - 1]));
  }
  return result;
}
export class PsqlDatabaseClient {
  constructor({ connectionString, schemaName = 'public', readOnly = false }) {
    if (!connectionString?.trim()) throw new Error('A PostgreSQL connection string is required');
    this.connectionString = connectionString;
    this.schemaName = schemaName;
    this.readOnly = readOnly;
    this.quotedSchema = quoteIdentifier(schemaName);
  }
  run(script) {
    const result = spawnSync('psql', [
      this.connectionString, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', script,
    ], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 120000 });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error('PostgreSQL command failed: ' + (result.stderr || result.stdout || 'psql failed').trim());
    }
    return (result.stdout || '').trim();
  }
  async queryRows(sql, values = []) {
    const query = applyParameters(sql.trim().replace(/;+\s*$/, ''), values);
    const script = [
      this.readOnly ? 'BEGIN READ ONLY;' : 'BEGIN;',
      'SET LOCAL search_path TO ' + this.quotedSchema + ', public;',
      'SELECT COALESCE(json_agg(row_to_json(_year95_rows)), \\'[]\\'::json)::text FROM (' + query + ') AS _year95_rows;',
      'COMMIT;',
    ].join('\n');
    const output = this.run(script);
    if (!output) return [];
    const parsed = JSON.parse(output);
    if (!Array.isArray(parsed)) throw new Error('Unexpected JSON response from PostgreSQL');
    return parsed;
  }
  async transaction(statements) {
    if (this.readOnly) throw new Error('Read-only database client refuses all transactions');
    const sql = statements.map((statement) => applyParameters(statement.sql, statement.values)).join(';\n');
    this.run(['BEGIN;', 'SET LOCAL search_path TO ' + this.quotedSchema + ', public;', sql + ';', 'COMMIT;'].join('\n'));
  }
}
