import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../packages/config/src/index.js';
import { createApiApp } from '../../apps/api/src/app.js';
import {
  createPgPool,
  PgAllowlistRepository,
  PgHealthRepository,
  type PgPool,
} from '../../packages/persistence/src/index.js';

describe('API PostgreSQL readiness integration', () => {
  let pool: PgPool | undefined;
  let app: ReturnType<typeof createApiApp> | undefined;

  beforeAll(() => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl)
      throw new Error('DATABASE_URL must point to the disposable CI PostgreSQL service');
    const config = loadConfig('api', { NODE_ENV: 'test', DATABASE_URL: databaseUrl });
    pool = createPgPool({
      connectionString: config.DATABASE_URL!.reveal(),
      sslMode: 'disable',
      nodeEnv: 'test',
    });
    app = createApiApp({
      config,
      dependencies: {
        healthRepository: new PgHealthRepository(pool),
        allowlistRepository: new PgAllowlistRepository(pool),
      },
    });
    app.addHook('onClose', async () => {
      await pool?.end();
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    else if (pool) await pool.end();
  });

  it('reports ready only after SELECT 1 succeeds against PostgreSQL', async () => {
    const response = await app!.inject({ method: 'GET', url: '/ready' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ok',
      ready: true,
      checks: { database: 'ok' },
    });
  });

  it('keeps liveness independent of database readiness', async () => {
    const response = await app!.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', service: 'year95-api' });
  });
});
