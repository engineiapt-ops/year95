import { describe, expect, it, vi } from "vitest";
import { createPgPool, withTransaction, type PgClient, type PgPool, type PgPoolOptions } from "../../packages/persistence/src/pg-pool.js";

describe("createPgPool", () => {
  it("uses TLS, bounded pool defaults and transaction-compatible options", () => {
    let options: PgPoolOptions | undefined;
    class FakePool {
      constructor(value: PgPoolOptions) { options = value; }
      query = vi.fn();
      connect = vi.fn();
      end = vi.fn();
    }
    createPgPool(FakePool as unknown as new (options: PgPoolOptions) => PgPool, { connectionString: "postgres://localhost/db" });
    expect(options).toEqual({
      connectionString: "postgres://localhost/db",
      ssl: { rejectUnauthorized: true },
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      allowExitOnIdle: false,
    });
  });
  it("rejects invalid pool configuration", () => {
    class FakePool { constructor(_options: PgPoolOptions) {} }
    const Pool = FakePool as unknown as new (options: PgPoolOptions) => PgPool;
    expect(() => createPgPool(Pool, { connectionString: " " })).toThrow(/connection string/);
    expect(() => createPgPool(Pool, { connectionString: "postgres://localhost/db", maxConnections: 21 })).toThrow(/maxConnections/);
  });
});

describe("withTransaction", () => {
  it("commits successful work and always releases the client", async () => {
    const calls: string[] = [];
    const client = { query: vi.fn(async (sql: string) => { calls.push(sql); return { rows: [], rowCount: 0 }; }), release: vi.fn() } as unknown as PgClient;
    const pool = { connect: vi.fn(async () => client) } as unknown as PgPool;
    await expect(withTransaction(pool, async () => "done")).resolves.toBe("done");
    expect(calls).toEqual(["BEGIN", "COMMIT"]);
    expect(client.release).toHaveBeenCalledOnce();
  });
  it("rolls back failures without hiding the original error", async () => {
    const calls: string[] = [];
    const client = { query: vi.fn(async (sql: string) => { calls.push(sql); return { rows: [], rowCount: 0 }; }), release: vi.fn() } as unknown as PgClient;
    const pool = { connect: vi.fn(async () => client) } as unknown as PgPool;
    const failure = new Error("work failed");
    await expect(withTransaction(pool, async () => { throw failure; })).rejects.toBe(failure);
    expect(calls).toEqual(["BEGIN", "ROLLBACK"]);
    expect(client.release).toHaveBeenCalledOnce();
  });
});
