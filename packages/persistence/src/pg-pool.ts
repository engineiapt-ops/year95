export interface PgQueryResult<Row> {
  readonly rows: readonly Row[];
  readonly rowCount: number | null;
}
export interface PgQueryable {
  query<Row = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<PgQueryResult<Row>>;
}
export interface PgClient extends PgQueryable {
  release(): void;
}
export interface PgPool extends PgQueryable {
  connect(): Promise<PgClient>;
  end(): Promise<void>;
}
export interface PgPoolOptions {
  readonly connectionString: string;
  readonly ssl: { readonly rejectUnauthorized: true };
  readonly max: number;
  readonly idleTimeoutMillis: number;
  readonly connectionTimeoutMillis: number;
  readonly allowExitOnIdle: false;
}
export interface PgPoolConstructor {
  new (options: PgPoolOptions): PgPool;
}
export interface PgPoolConfig {
  readonly connectionString: string;
  readonly maxConnections?: number;
  readonly idleTimeoutMillis?: number;
  readonly connectionTimeoutMillis?: number;
}

/** Inject the node-postgres Pool constructor to keep driver construction at the infrastructure boundary. */
export function createPgPool(Pool: PgPoolConstructor, config: PgPoolConfig): PgPool {
  if (!config.connectionString.trim()) throw new Error("PostgreSQL connection string is required");
  const max = config.maxConnections ?? 5;
  const idleTimeoutMillis = config.idleTimeoutMillis ?? 10_000;
  const connectionTimeoutMillis = config.connectionTimeoutMillis ?? 5_000;
  if (!Number.isInteger(max) || max < 1 || max > 20) throw new Error("maxConnections must be an integer between 1 and 20");
  if (!Number.isInteger(idleTimeoutMillis) || idleTimeoutMillis < 1) throw new Error("idleTimeoutMillis must be a positive integer");
  if (!Number.isInteger(connectionTimeoutMillis) || connectionTimeoutMillis < 1) throw new Error("connectionTimeoutMillis must be a positive integer");
  return new Pool({
    connectionString: config.connectionString,
    ssl: { rejectUnauthorized: true },
    max,
    idleTimeoutMillis,
    connectionTimeoutMillis,
    allowExitOnIdle: false,
  });
}

/** Always releases the client; rollback errors never mask the original transaction failure. */
export async function withTransaction<T>(pool: PgPool, work: (client: PgClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let began = false;
  try {
    await client.query("BEGIN");
    began = true;
    const result = await work(client);
    await client.query("COMMIT");
    began = false;
    return result;
  } catch (error) {
    if (began) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
    }
    throw error;
  } finally {
    client.release();
  }
}
