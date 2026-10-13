import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../packages/config/src/index.js';
import { healthResponseSchema, httpErrorResponseSchema, readyResponseSchema } from '../../packages/contracts/src/index.js';
import { buildApp, createApiApp } from '../../apps/api/src/app.js';
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
      dependencies: { healthRepository: { isDatabaseReady: async () => false } },
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


describe('YEAR95 API shell contracts', () => {
  it('returns an opaque request id and the shared error envelope for protected API requests', async () => {
    const app = buildApp({
      config: loadConfig('api', { NODE_ENV: 'test', LOG_LEVEL: 'fatal' }),
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/me',
        headers: { 'x-request-id': 'caller-controlled-id' },
      });
      expect(response.statusCode).toBe(401);
      expect(httpErrorResponseSchema.parse(JSON.parse(response.body) as unknown)).toEqual({
        error: { code: 'UNAUTHORIZED', message: 'Bearer token required' },
      });
      expect(response.headers['x-request-id']).toBeTruthy();
      expect(response.headers['x-request-id']).not.toBe('caller-controlled-id');
    } finally {
      await app.close();
    }
  });

  it('rejects CORS origins that are not present in the configured allowlist', async () => {
    const app = buildApp({
      config: loadConfig('api', {
        NODE_ENV: 'test',
        LOG_LEVEL: 'fatal',
        CORS_ORIGINS: 'https://console.example.test',
      }),
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { origin: 'https://untrusted.example.test' },
      });
      expect(response.statusCode).toBe(403);
      expect(httpErrorResponseSchema.parse(JSON.parse(response.body) as unknown)).toEqual({
        error: { code: 'FORBIDDEN', message: 'Origin is not allowed' },
      });
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it('allows configured CORS origins and answers valid preflight requests', async () => {
    const app = buildApp({
      config: loadConfig('api', {
        NODE_ENV: 'test',
        LOG_LEVEL: 'fatal',
        CORS_ORIGINS: 'https://console.example.test',
      }),
    });

    try {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/v1/me',
        headers: {
          origin: 'https://console.example.test',
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'authorization, content-type',
        },
      });
      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('https://console.example.test');
      expect(response.headers['access-control-allow-methods']).toContain('GET');
      expect(response.headers['access-control-allow-headers']).toBe('authorization, content-type');
    } finally {
      await app.close();
    }
  });

  it('enforces the configurable standard request limit per client and per minute', async () => {
    const app = buildApp({
      config: loadConfig('api', {
        NODE_ENV: 'test',
        LOG_LEVEL: 'fatal',
        RATE_LIMIT_MAX: '2',
        RATE_LIMIT_HEAVY_MAX: '1',
      }),
    });

    try {
      expect((await app.inject({ method: 'GET', url: '/v1/me' })).statusCode).toBe(401);
      expect((await app.inject({ method: 'GET', url: '/v1/me' })).statusCode).toBe(401);

      const limited = await app.inject({ method: 'GET', url: '/v1/me' });
      expect(limited.statusCode).toBe(429);
      expect(httpErrorResponseSchema.parse(JSON.parse(limited.body) as unknown).error.code)
        .toBe('TOO_MANY_REQUESTS');
      expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });

  it('enforces the independent heavy limit for routes marked heavy', async () => {
    const app = buildApp({
      config: loadConfig('api', {
        NODE_ENV: 'test',
        LOG_LEVEL: 'fatal',
        RATE_LIMIT_MAX: '10',
        RATE_LIMIT_HEAVY_MAX: '1',
      }),
      registerV1Routes(v1) {
        v1.get('/heavy-test', { config: { rateLimit: 'heavy' } }, async () => ({ ok: true }));
      },
    });

    try {
      expect((await app.inject({ method: 'GET', url: '/v1/heavy-test' })).statusCode).toBe(401);
      const limited = await app.inject({ method: 'GET', url: '/v1/heavy-test' });
      expect(limited.statusCode).toBe(429);
      expect(httpErrorResponseSchema.parse(JSON.parse(limited.body) as unknown).error.code)
        .toBe('TOO_MANY_REQUESTS');
    } finally {
      await app.close();
    }
  });
});
