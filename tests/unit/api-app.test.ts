import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../packages/config/src/index.js';
import { healthResponseSchema, readyResponseSchema } from '../../packages/contracts/src/index.js';
import { createApiApp } from '../../apps/api/src/app.js';
import { VERSION } from '../../apps/api/src/index.js';

describe('YEAR95 API runtime', () => {
  it('returns the versioned health contract without requiring database credentials', async () => {
    const app = createApiApp({
      config: loadConfig('api', { NODE_ENV: 'test' }),
      dependencies: { healthRepository: { isDatabaseReady: async () => false } },
    });

    try {
      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(200);
      expect(healthResponseSchema.parse(JSON.parse(response.body) as unknown)).toEqual({
        status: 'ok',
        service: 'year95-api',
        version: VERSION,
      });
    } finally {
      await app.close();
    }
  });

  it('returns not-ready and HTTP 503 when the database is unavailable', async () => {
    const app = createApiApp({
      config: loadConfig('api', { NODE_ENV: 'test' }),
      dependencies: { databaseReady: async () => false },
    });

    try {
      const response = await app.inject({ method: 'GET', url: '/ready' });
      expect(response.statusCode).toBe(503);
      expect(readyResponseSchema.parse(JSON.parse(response.body) as unknown)).toEqual({
        status: 'not_ready',
        ready: false,
        version: VERSION,
        checks: { database: 'not_ready' },
      });
    } finally {
      await app.close();
    }
  });

  it('returns ready only when the injected database probe succeeds', async () => {
    const app = createApiApp({
      config: loadConfig('api', { NODE_ENV: 'test' }),
      dependencies: { healthRepository: { isDatabaseReady: async () => true } },
    });

    try {
      const response = await app.inject({ method: 'GET', url: '/ready' });
      expect(response.statusCode).toBe(200);
      expect(readyResponseSchema.parse(JSON.parse(response.body) as unknown)).toEqual({
        status: 'ok',
        ready: true,
        version: VERSION,
        checks: { database: 'ok' },
      });
    } finally {
      await app.close();
    }
  });

  it('fails closed if the injected database probe throws', async () => {
    const app = createApiApp({
      config: loadConfig('api', { NODE_ENV: 'test' }),
      dependencies: {
        healthRepository: {
          isDatabaseReady: async () => {
            throw new Error('private diagnostic');
          },
        },
      },
    });

    try {
      const response = await app.inject({ method: 'GET', url: '/ready' });
      expect(response.statusCode).toBe(503);
      expect(response.body).not.toContain('private diagnostic');
    } finally {
      await app.close();
    }
  });
});
