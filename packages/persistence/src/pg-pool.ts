import { Pool } from 'pg';

export interface PgQueryResult<Row> {
  readonly rows: readonly Row[];
  readonly rowCount: number | null;
}
export interface PgQueryable {
  query<Row = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<PgQueryResult<Row>>;
}
export interface PgClient extends PgQueryable {
  release(): void;
}
export interface PgPool extends PgQueryable {
  connect(): Promise<PgClient>;
  end(): Promise<void>;
}
export type PgSslOptions = false | { readonly rejectUnauthorized: true; readonly ca?: string };
export interface PgPoolOptions {
  readonly connectionString: string;
  readonly ssl: PgSslOptions;
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
  readonly sslMode?: 'verify-full' | 'disable';
  readonly caCertPem?: string;
  readonly nodeEnv?: 'development' | 'test' | 'production';
}

const localHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

const sslConnectionParameters = new Set([
  'ssl',
  'sslmode',
  'sslrootcert',
  'sslcert',
  'sslkey',
  'uselibpqcompat',
]);

function sanitizeSslConnectionParameters(connectionString: string): string {
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error('PostgreSQL connection string must be a valid URL');
  }
  let changed = false;
  for (const key of Array.from(parsed.searchParams.keys())) {
    if (sslConnectionParameters.has(key.toLowerCase())) {
      parsed.searchParams.delete(key);
      changed = true;
    }
  }
  return changed ? parsed.toString() : connectionString;
}

function connectionHost(connectionString: string): string {
  return new URL(connectionString).hostname;
}

/**
 * The default verifies the server certificate and hostname. A custom CA can be
 * supplied for Supabase. Disabling TLS is reserved for local disposable tests.
 * Query APIs intentionally accept SQL text/values, not named query configs, so
 * callers cannot accidentally enable named prepared statements in transaction mode.
 */
export function createPgPool(config: PgPoolConfig): PgPool;
export function createPgPool(PoolConstructor: PgPoolConstructor, config: PgPoolConfig): PgPool;
export function createPgPool(
  configOrPool: PgPoolConfig | PgPoolConstructor,
  maybeConfig?: PgPoolConfig,
): PgPool {
  const PoolConstructor =
    typeof configOrPool === 'function' ? configOrPool : (Pool as unknown as PgPoolConstructor);
  const config = typeof configOrPool === 'function' ? maybeConfig! : configOrPool;
  if (!config.connectionString.trim()) throw new Error('PostgreSQL connection string is required');
  const connectionString = sanitizeSslConnectionParameters(config.connectionString);
  const max = config.maxConnections ?? 5;
  const idleTimeoutMillis = config.idleTimeoutMillis ?? 10_000;
  const connectionTimeoutMillis = config.connectionTimeoutMillis ?? 5_000;
  if (!Number.isInteger(max) || max < 1 || max > 20)
    throw new Error('maxConnections must be an integer between 1 and 20');
  if (!Number.isInteger(idleTimeoutMillis) || idleTimeoutMillis < 1)
    throw new Error('idleTimeoutMillis must be a positive integer');
  if (!Number.isInteger(connectionTimeoutMillis) || connectionTimeoutMillis < 1)
    throw new Error('connectionTimeoutMillis must be a positive integer');

  const sslMode = config.sslMode ?? 'verify-full';
  const caCertPem = config.caCertPem?.trim();
  let ssl: PgSslOptions;
  if (sslMode === 'disable') {
    const host = connectionHost(connectionString);
    if (config.nodeEnv !== 'test' || !localHosts.has(host)) {
      throw new Error('SSL may be disabled only in NODE_ENV=test against a local PostgreSQL host');
    }
    if (caCertPem) throw new Error('caCertPem cannot be combined with SSL disabled');
    ssl = false;
  } else {
    ssl = caCertPem ? { rejectUnauthorized: true, ca: caCertPem } : { rejectUnauthorized: true };
  }

  return new PoolConstructor({
    connectionString,
    ssl,
    max,
    idleTimeoutMillis,
    connectionTimeoutMillis,
    allowExitOnIdle: false,
  });
}

/** Always releases the client; rollback errors never mask the original transaction failure. */
export async function withTransaction<T>(
  pool: PgPool,
  work: (client: PgClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let began = false;
  try {
    await client.query('BEGIN');
    began = true;
    const result = await work(client);
    await client.query('COMMIT');
    began = false;
    return result;
  } catch (error) {
    if (began) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* preserve original error */
      }
    }
    throw error;
  } finally {
    client.release();
  }
}
