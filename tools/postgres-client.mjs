import process from 'node:process';
import { spawnSync } from 'node:child_process';

function quoteIdentifier(identifier) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier))
    throw new Error('Unsafe PostgreSQL schema identifier');
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

export function applyParameters(sql, values = []) {
  let result = '';
  let i = 0;
  const len = sql.length;

  function isIdentStart(c) {
    if (!c) return false;
    return /^[a-zA-Z_\x80-\uFFFF]$/.test(c);
  }

  function isIdentPart(c) {
    if (!c) return false;
    return /^[a-zA-Z0-9_$\x80-\uFFFF]$/.test(c);
  }

  while (i < len) {
    const c = sql[i];

    // 1. Line comment
    if (c === '-' && sql[i + 1] === '-') {
      let newline = sql.indexOf('\n', i + 2);
      if (newline === -1) newline = len;
      else newline++;
      result += sql.substring(i, newline);
      i = newline;
      continue;
    }

    // 2. Block comment
    if (c === '/' && sql[i + 1] === '*') {
      let depth = 1;
      let start = i;
      i += 2;
      while (i < len && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') {
          depth++;
          i += 2;
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          depth--;
          i += 2;
        } else {
          i++;
        }
      }
      result += sql.substring(start, i);
      continue;
    }

    // 3. Identifiers & E-strings
    if (isIdentStart(c)) {
      let start = i;
      if ((c === 'E' || c === 'e') && sql[i + 1] === "'") {
        result += c + "'";
        i += 2;
        while (i < len) {
          if (sql[i] === '\\') {
            result += sql.substring(i, i + 2);
            i += 2;
          } else if (sql[i] === "'") {
            if (sql[i + 1] === "'") {
              result += "''";
              i += 2;
            } else {
              result += "'";
              i++;
              break;
            }
          } else {
            result += sql[i];
            i++;
          }
        }
        continue;
      }

      while (i < len && isIdentPart(sql[i])) {
        i++;
      }
      result += sql.substring(start, i);
      continue;
    }

    // 4. Regular Strings
    if (c === "'") {
      let start = i;
      i++;
      while (i < len) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          i++;
        }
      }
      result += sql.substring(start, i);
      continue;
    }

    // 5. Quoted Identifiers
    if (c === '"') {
      let start = i;
      i++;
      while (i < len) {
        if (sql[i] === '"') {
          if (sql[i + 1] === '"') {
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          i++;
        }
      }
      result += sql.substring(start, i);
      continue;
    }

    // 6. Dollar quotes and Parameters
    if (c === '$') {
      let match = sql.substring(i).match(/^\$([a-zA-Z_\x80-\uFFFF][a-zA-Z0-9_\x80-\uFFFF]*)?\$/);
      if (match) {
        let tag = match[0];
        let start = i;
        i += tag.length;
        let endIdx = sql.indexOf(tag, i);
        if (endIdx === -1) {
          i = len;
        } else {
          i = endIdx + tag.length;
        }
        result += sql.substring(start, i);
        continue;
      }

      let paramMatch = sql.substring(i).match(/^\$([0-9]+)/);
      if (paramMatch) {
        let paramStr = paramMatch[0];
        let paramIdx = parseInt(paramMatch[1], 10);
        if (paramIdx >= 1 && paramIdx <= values.length) {
          result += quoteValue(values[paramIdx - 1]);
        } else {
          throw new Error('Parameter ' + paramStr + ' has no matching value');
        }
        i += paramStr.length;
        continue;
      }
    }

    result += c;
    i++;
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
    const env = { ...process.env };
    if (env.PGOPTIONS) {
      env.PGOPTIONS = env.PGOPTIONS + ' -c standard_conforming_strings=on';
    } else {
      env.PGOPTIONS = '-c standard_conforming_strings=on';
    }

    const result = spawnSync(
      'psql',
      [this.connectionString, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', script],
      { env, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 120000 },
    );

    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(
        'PostgreSQL command failed: ' + (result.stderr || result.stdout || 'psql failed').trim(),
      );
    }
    return (result.stdout || '').trim();
  }

  async queryRows(sql, values = []) {
    const query = applyParameters(sql.trim().replace(/;+\s*$/, ''), values);
    const script = [
      this.readOnly ? 'BEGIN READ ONLY;' : 'BEGIN;',
      'SET LOCAL search_path TO ' + this.quotedSchema + ', public;',
      "SELECT COALESCE(json_agg(row_to_json(_year95_rows)), '[]'::json)::text FROM (" +
        query +
        ') AS _year95_rows;',
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
    const sql = statements
      .map((statement) => applyParameters(statement.sql, statement.values))
      .join(';\n');
    this.run(
      [
        'BEGIN;',
        'SET LOCAL search_path TO ' + this.quotedSchema + ', public;',
        sql + ';',
        'COMMIT;',
      ].join('\n'),
    );
  }
}
