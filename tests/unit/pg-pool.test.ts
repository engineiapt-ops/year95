import { describe, expect, it, vi } from 'vitest';
import {
  createPgPool,
  withTransaction,
  type PgClient,
  type PgPool,
  type PgPoolOptions,
} from '../../packages/persistence/src/pg-pool.js';

function fakePoolFactory() {
  let options: PgPoolOptions | undefined;
  class FakePool {
    constructor(value: PgPoolOptions) {
      options = value;
    }
    query = vi.fn();
    connect = vi.fn();
    end = vi.fn();
  }
  return {
    Pool: FakePool as unknown as new (options: PgPoolOptions) => PgPool,
    options: () => options,
  };
}

describe('createPgPool SSL policy', () => {
  it('defaults to verify-full with bounded pool settings', () => {
    const fake = fakePoolFactory();
    createPgPool(fake.Pool, { connectionString: 'postgres://db.example.com/db' });
    expect(fake.options()).toEqual({
      connectionString: 'postgres://db.example.com/db',
      ssl: { rejectUnauthorized: true },
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      allowExitOnIdle: false,
    });
  });

  it('prevents SSL URL parameters from overriding explicit verification and CA settings', () => {
    const fake = fakePoolFactory();
    createPgPool(fake.Pool, {
      connectionString:
        'postgres://db.example.com/db?sslmode=require&sslrootcert=%2Ftmp%2Fca&application_name=year95',
      caCertPem: 'custom-ca',
    });
    const options = fake.options();
    expect(options?.connectionString).toBe('postgres://db.example.com/db?application_name=year95');
    expect(options?.ssl).toEqual({ rejectUnauthorized: true, ca: 'custom-ca' });
  });

  it('pins TLS verification to an explicitly supplied CA', () => {
    const fake = fakePoolFactory();
    createPgPool(fake.Pool, {
      connectionString: 'postgres://db.example.com/db',
      caCertPem: '-----BEGIN CERTIFICATE-----\nca\n-----END CERTIFICATE-----',
    });
    expect(fake.options()?.ssl).toEqual({
      rejectUnauthorized: true,
      ca: '-----BEGIN CERTIFICATE-----\nca\n-----END CERTIFICATE-----',
    });
  });

  it('allows TLS disable only for a local test database', () => {
    const fake = fakePoolFactory();
    createPgPool(fake.Pool, {
      connectionString: 'postgres://localhost/db',
      sslMode: 'disable',
      nodeEnv: 'test',
    });
    expect(fake.options()?.ssl).toBe(false);
  });

  it('rejects TLS disable outside test or against non-local hosts', () => {
    const fake = fakePoolFactory();
    expect(() =>
      createPgPool(fake.Pool, {
        connectionString: 'postgres://localhost/db',
        sslMode: 'disable',
        nodeEnv: 'production',
      }),
    ).toThrow(/only in NODE_ENV=test/);
    expect(() =>
      createPgPool(fake.Pool, {
        connectionString: 'postgres://db.example.com/db',
        sslMode: 'disable',
        nodeEnv: 'test',
      }),
    ).toThrow(/only in NODE_ENV=test/);
    expect(() =>
      createPgPool(fake.Pool, {
        connectionString: 'postgres://localhost/db',
        sslMode: 'disable',
        nodeEnv: 'test',
        caCertPem: 'ca',
      }),
    ).toThrow(/caCertPem/);
  });

  it('rejects invalid pool configuration', () => {
    const fake = fakePoolFactory();
    expect(() => createPgPool(fake.Pool, { connectionString: ' ' })).toThrow(/connection string/);
    expect(() =>
      createPgPool(fake.Pool, { connectionString: 'postgres://localhost/db', maxConnections: 21 }),
    ).toThrow(/maxConnections/);
  });
});

describe('withTransaction', () => {
  it('commits successful work and always releases the client', async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        calls.push(sql);
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    } as unknown as PgClient;
    const pool = { connect: vi.fn(async () => client) } as unknown as PgPool;
    await expect(withTransaction(pool, async () => 'done')).resolves.toBe('done');
    expect(calls).toEqual(['BEGIN', 'COMMIT']);
    expect(client.release).toHaveBeenCalledOnce();
  });
  it('rolls back failures without hiding the original error', async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        calls.push(sql);
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    } as unknown as PgClient;
    const pool = { connect: vi.fn(async () => client) } as unknown as PgPool;
    const failure = new Error('work failed');
    await expect(
      withTransaction(pool, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(calls).toEqual(['BEGIN', 'ROLLBACK']);
    expect(client.release).toHaveBeenCalledOnce();
  });
});
