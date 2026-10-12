import { describe, it, expect } from 'vitest';
import { applyParameters } from '../../tools/postgres-client.mjs';

describe('applyParameters', () => {
  it('should preserve $1 when replacing $2', () => {
    const sql = "SELECT $2";
    const values = ["marcador", "texto com $1 no meio"];
    const result = applyParameters(sql, values);
    expect(result).toBe("SELECT 'texto com $1 no meio'");
  });

  it('should ignore $ references inside strings', () => {
    const sql = "SELECT '$1' AS val";
    const values = [];
    const result = applyParameters(sql, values);
    expect(result).toBe("SELECT '$1' AS val");
  });

  it('should ignore $ references inside E-strings', () => {
    const sql = "SELECT E'\\'$1' AS val";
    const values = [];
    const result = applyParameters(sql, values);
    expect(result).toBe("SELECT E'\\'$1' AS val");
  });

  it('should correctly boundary check E-strings', () => {
    const sql = "SELECT CAFE'$1'"; // identifier CAFE followed by string literal '$1'
    const values = [];
    const result = applyParameters(sql, values);
    expect(result).toBe("SELECT CAFE'$1'");
  });

  it('should ignore $ references inside dollar quotes', () => {
    const sql = "SELECT $$ $1 $$ AS val, $tag$ $2 $tag$ AS val2";
    const values = [];
    const result = applyParameters(sql, values);
    expect(result).toBe("SELECT $$ $1 $$ AS val, $tag$ $2 $tag$ AS val2");
  });

  it('should ignore $ references inside quoted identifiers', () => {
    const sql = 'SELECT 1 AS "$1"';
    const values = [];
    const result = applyParameters(sql, values);
    expect(result).toBe('SELECT 1 AS "$1"');
  });

  it('should ignore $ references inside nested block comments', () => {
    const sql = "SELECT /* /* $1 */ */ 1";
    const values = [];
    const result = applyParameters(sql, values);
    expect(result).toBe("SELECT /* /* $1 */ */ 1");
  });

  it('should ignore $ references inside line comments', () => {
    const sql = "SELECT 1 -- $1";
    const values = [];
    const result = applyParameters(sql, values);
    expect(result).toBe("SELECT 1 -- $1");
  });

  it('should not alter unquoted identifiers containing $ and unicode', () => {
    const sql = "SELECT café$1";
    const values = [];
    const result = applyParameters(sql, values);
    expect(result).toBe("SELECT café$1");
  });

  it('should reject parameters without matching values', () => {
    const sql = "SELECT $1";
    const values = [];
    expect(() => applyParameters(sql, values)).toThrowError(/no matching value/);
  });

  it('should format values correctly', () => {
    const sql = "SELECT $1, $2, $3, $4";
    const values = [null, true, 42, "O'Connor"];
    const result = applyParameters(sql, values);
    expect(result).toBe("SELECT NULL, TRUE, 42, 'O''Connor'");
  });
});
