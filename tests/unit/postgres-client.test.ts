import { describe, it, expect } from 'vitest';
import { applyParameters } from '../../tools/postgres-client.mjs';


import { vi } from 'vitest';
import * as child_process from 'node:child_process';
import { PsqlDatabaseClient } from '../../tools/postgres-client.mjs';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0, stdout: 'mocked output' })),
}));

describe('PsqlDatabaseClient', () => {
  it('should pass standard_conforming_strings=on via PGOPTIONS', () => {
    const client = new PsqlDatabaseClient({ connectionString: 'postgres://dummy' });
    const originalEnv = process.env.PGOPTIONS;
    try {
      process.env.PGOPTIONS = '-c some_other_option=on';
      client.run('SELECT 1');
      expect(child_process.spawnSync).toHaveBeenCalledWith(
        'psql',
        expect.anything(),
        expect.objectContaining({
          env: expect.objectContaining({
            PGOPTIONS: '-c some_other_option=on -c standard_conforming_strings=on'
          })
        })
      );
    } finally {
      if (originalEnv === undefined) {
        delete process.env.PGOPTIONS;
      } else {
        process.env.PGOPTIONS = originalEnv;
      }
    }
  });

  it('should override previous standard_conforming_strings=off settings', () => {
    const client = new PsqlDatabaseClient({ connectionString: 'postgres://dummy' });
    const originalEnv = process.env.PGOPTIONS;
    try {
      process.env.PGOPTIONS = '-c standard_conforming_strings=off';
      client.run('SELECT 1');
      expect(child_process.spawnSync).toHaveBeenCalledWith(
        'psql',
        expect.anything(),
        expect.objectContaining({
          env: expect.objectContaining({
            PGOPTIONS: '-c standard_conforming_strings=off -c standard_conforming_strings=on'
          })
        })
      );
    } finally {
      if (originalEnv === undefined) {
        delete process.env.PGOPTIONS;
      } else {
        process.env.PGOPTIONS = originalEnv;
      }
    }
  });

  it('should set standard_conforming_strings=on if PGOPTIONS is unset', () => {
    const client = new PsqlDatabaseClient({ connectionString: 'postgres://dummy' });
    const originalEnv = process.env.PGOPTIONS;
    try {
      delete process.env.PGOPTIONS;
      client.run('SELECT 1');
      expect(child_process.spawnSync).toHaveBeenCalledWith(
        'psql',
        expect.anything(),
        expect.objectContaining({
          env: expect.objectContaining({
            PGOPTIONS: '-c standard_conforming_strings=on'
          })
        })
      );
    } finally {
      if (originalEnv === undefined) {
        delete process.env.PGOPTIONS;
      } else {
        process.env.PGOPTIONS = originalEnv;
      }
    }
  });

  it('should correctly escape backslashes and single quotes', () => {
    const sql = "SELECT $1";
    const values = [`text with \\ and ' quote`];
    const result = applyParameters(sql, values);
    expect(result).toBe(`SELECT 'text with \\ and '' quote'`);
  });
});


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

  it('should ignore $ references inside dollar quotes with unicode tags', () => {
    const sql = "SELECT $café$ $1 $café$ AS val";
    const values = [];
    const result = applyParameters(sql, values);
    expect(result).toBe("SELECT $café$ $1 $café$ AS val");
  });

  it('should replace parameters following a dollar quote', () => {
    const sql = "SELECT $tag$ text $tag$, $1";
    const values = ["value"];
    const result = applyParameters(sql, values);
    expect(result).toBe("SELECT $tag$ text $tag$, 'value'");
  });

  it('should replace multi-digit parameters', () => {
    const sql = "SELECT $1, $10";
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = applyParameters(sql, values);
    expect(result).toBe("SELECT 1, 10");
  });

  it('should format false as FALSE', () => {
    const sql = "SELECT $1";
    const values = [false];
    const result = applyParameters(sql, values);
    expect(result).toBe("SELECT FALSE");
  });

  it('should preserve finite decimal numbers', () => {
    const sql = "SELECT $1";
    const values = [3.14159];
    const result = applyParameters(sql, values);
    expect(result).toBe("SELECT 3.14159");
  });

  it('should reject Infinity, -Infinity, and NaN', () => {
    const sql = "SELECT $1";
    expect(() => applyParameters(sql, [Infinity])).toThrowError(/finite numbers/);
    expect(() => applyParameters(sql, [-Infinity])).toThrowError(/finite numbers/);
    expect(() => applyParameters(sql, [NaN])).toThrowError(/finite numbers/);
  });
});
