import { randomUUID } from 'node:crypto';
import Fastify, {
  type FastifyInstance,
  type FastifyLoggerOptions,
  type FastifyReply,
} from 'fastify';
import type { ApiConfig } from '@year95/config';
import type { AllowlistRepository, HealthRepository, HttpErrorCode } from '@year95/contracts';
import {
  httpErrorResponseSchema,
  healthResponseSchema,
  readyResponseSchema,
} from '@year95/contracts';
import { registerAuthPlugin } from './plugins/auth.js';
import { VERSION } from './index.js';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_PRUNE_INTERVAL_MS = 60_000;
const MAX_REQUESTED_CORS_HEADERS = new Set([
  'accept',
  'authorization',
  'content-type',
  'x-request-id',
]);
const ALLOWED_CORS_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

type RateLimitTier = 'standard' | 'heavy' | 'disabled';

declare module 'fastify' {
  interface FastifyContextConfig {
    rateLimit?: RateLimitTier;
  }
}

interface RateWindow {
  startedAt: number;
  count: number;
}

interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  resetAfterSeconds: number;
  retryAfterSeconds: number;
}

export interface ApiDependencies {
  readonly healthRepository?: Pick<HealthRepository, 'isDatabaseReady'>;
  readonly allowlistRepository?: Pick<AllowlistRepository, 'isAllowed'>;
}

export interface ApiAppOptions {
  readonly config: ApiConfig;
  readonly dependencies?: ApiDependencies;
  /** Optional logger destination for deterministic diagnostics tests. */
  readonly logStream?: FastifyLoggerOptions['stream'];
  /**
   * Extension point for future HTTP contracts. Routes registered here are always
   * nested under /v1 and can opt into the independent heavy rate limit.
   */
  readonly registerV1Routes?: (v1: FastifyInstance) => void | Promise<void>;
}

function sendHttpError(
  reply: FastifyReply,
  statusCode: number,
  code: HttpErrorCode,
  message: string,
): FastifyReply {
  return reply.code(statusCode).send(httpErrorResponseSchema.parse({ error: { code, message } }));
}

function errorCodeForStatus(statusCode: number): HttpErrorCode {
  switch (statusCode) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 422:
      return 'UNPROCESSABLE_ENTITY';
    case 429:
      return 'TOO_MANY_REQUESTS';
    case 503:
      return 'SERVICE_UNAVAILABLE';
    default:
      return statusCode >= 400 && statusCode < 500 ? 'BAD_REQUEST' : 'INTERNAL_ERROR';
  }
}

function publicMessageForStatus(statusCode: number): string {
  switch (statusCode) {
    case 400:
    case 422:
      return 'Request could not be processed';
    case 401:
      return 'Authentication required';
    case 403:
      return 'Forbidden';
    case 404:
      return 'Route not found';
    case 409:
      return 'Conflict';
    case 429:
      return 'Rate limit exceeded';
    case 503:
      return 'Service unavailable';
    default:
      return 'Internal server error';
  }
}

function parseCorsOrigins(origins: readonly string[]): ReadonlySet<string> {
  const parsed = origins.map((origin) => {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error('CORS_ORIGINS must contain valid HTTP(S) origins');
    }

    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username !== '' ||
      url.password !== '' ||
      url.origin !== origin ||
      url.pathname !== '/' ||
      url.search !== '' ||
      url.hash !== ''
    ) {
      throw new Error('CORS_ORIGINS must contain exact HTTP(S) origins');
    }

    return url.origin;
  });

  return new Set(parsed);
}

function consumeRateLimit(
  buckets: Map<string, RateWindow>,
  key: string,
  max: number,
  now: number,
): RateLimitDecision {
  const current = buckets.get(key);
  const window =
    !current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS
      ? { startedAt: now, count: 0 }
      : current;

  window.count += 1;
  buckets.set(key, window);

  const remaining = Math.max(0, max - window.count);
  const resetAtMs = window.startedAt + RATE_LIMIT_WINDOW_MS;

  return {
    allowed: window.count <= max,
    remaining,
    resetAfterSeconds: Math.max(1, Math.ceil((resetAtMs - now) / 1000)),
    retryAfterSeconds: Math.max(1, Math.ceil((resetAtMs - now) / 1000)),
  };
}

function responseForLimit(
  reply: FastifyReply,
  decision: RateLimitDecision,
  max: number,
): FastifyReply {
  reply
    .header('RateLimit-Limit', String(max))
    .header('RateLimit-Remaining', String(decision.remaining))
    .header('RateLimit-Reset', String(decision.resetAfterSeconds));

  if (decision.allowed) return reply;

  reply.header('Retry-After', String(decision.retryAfterSeconds));
  return sendHttpError(reply, 429, 'TOO_MANY_REQUESTS', 'Rate limit exceeded');
}

export function buildApp(options: ApiAppOptions): FastifyInstance {
  const { config } = options;
  const allowedOrigins = parseCorsOrigins(config.CORS_ORIGINS);
  const rateLimitBuckets = new Map<string, RateWindow>();
  let lastPrunedAt = 0;

  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      ...(options.logStream ? { stream: options.logStream } : {}),
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["set-cookie"]',
          'req.headers["x-api-key"]',
          'req.headers["x-auth-token"]',
          'req.body.password',
          'req.body.token',
          'req.body.secret',
          'req.body.apiKey',
          'req.body.api_key',
          'res.headers["set-cookie"]',
        ],
        censor: '[REDACTED]',
      },
    },
    requestIdHeader: false,
    genReqId: () => randomUUID(),
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (origin === undefined) return;

    if (!allowedOrigins.has(origin)) {
      return sendHttpError(reply, 403, 'FORBIDDEN', 'Origin is not allowed');
    }

    reply.header('access-control-allow-origin', origin);
    reply.header('vary', 'Origin');

    if (request.method !== 'OPTIONS') return;

    const requestedMethod = request.headers['access-control-request-method'];
    if (typeof requestedMethod !== 'string') return;

    if (!ALLOWED_CORS_METHODS.has(requestedMethod.toUpperCase())) {
      return sendHttpError(reply, 403, 'FORBIDDEN', 'CORS request method is not allowed');
    }

    const rawRequestedHeaders = request.headers['access-control-request-headers'];
    const requestedHeaders =
      typeof rawRequestedHeaders === 'string'
        ? rawRequestedHeaders
            .split(',')
            .map((header) => header.trim().toLowerCase())
            .filter(Boolean)
        : [];

    if (requestedHeaders.some((header) => !MAX_REQUESTED_CORS_HEADERS.has(header))) {
      return sendHttpError(reply, 403, 'FORBIDDEN', 'CORS request headers are not allowed');
    }

    reply
      .header('access-control-allow-methods', [...ALLOWED_CORS_METHODS].join(', '))
      .header('access-control-allow-headers', requestedHeaders.join(', '))
      .header('access-control-max-age', '600');

    return reply.code(204).send();
  });

  app.addHook('onRequest', async (request, reply) => {
    const tier = request.routeOptions.config.rateLimit ?? 'standard';
    if (tier === 'disabled') return;

    const now = Date.now();
    if (now - lastPrunedAt >= RATE_LIMIT_PRUNE_INTERVAL_MS) {
      lastPrunedAt = now;
      for (const [key, bucket] of rateLimitBuckets) {
        if (now - bucket.startedAt >= RATE_LIMIT_WINDOW_MS) rateLimitBuckets.delete(key);
      }
    }

    const clientKey = request.ip || request.socket.remoteAddress || 'unknown';
    const standardDecision = consumeRateLimit(
      rateLimitBuckets,
      `${clientKey}:standard`,
      config.RATE_LIMIT_MAX,
      now,
    );
    const standardReply = responseForLimit(reply, standardDecision, config.RATE_LIMIT_MAX);
    if (!standardDecision.allowed) return standardReply;

    if (tier === 'heavy') {
      const heavyDecision = consumeRateLimit(
        rateLimitBuckets,
        `${clientKey}:heavy`,
        config.RATE_LIMIT_HEAVY_MAX,
        now,
      );
      const heavyReply = responseForLimit(reply, heavyDecision, config.RATE_LIMIT_HEAVY_MAX);
      if (!heavyDecision.allowed) return heavyReply;
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (reply.sent) return;

    const rawStatus = (error as Error & { statusCode?: unknown }).statusCode;
    const statusCode =
      typeof rawStatus === 'number' && rawStatus >= 400 && rawStatus <= 599 ? rawStatus : 500;
    const code = errorCodeForStatus(statusCode);

    if (statusCode >= 500) {
      request.log.error(
        {
          requestId: request.id,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          errorCode: code,
        },
        'Unhandled API error',
      );
    }

    return sendHttpError(reply, statusCode, code, publicMessageForStatus(statusCode));
  });

  app.setNotFoundHandler((request, reply) =>
    sendHttpError(reply, 404, 'NOT_FOUND', 'Route not found'),
  );

  registerAuthPlugin(
    app,
    {
      supabaseUrl: config.SUPABASE_URL,
      jwksUrl: config.SUPABASE_JWKS_URL,
      issuer: config.SUPABASE_JWT_ISSUER,
      audience: config.SUPABASE_JWT_AUDIENCE,
      clockToleranceSeconds: config.SUPABASE_JWT_CLOCK_TOLERANCE_SECONDS,
      jwksCacheMaxAgeMs: config.SUPABASE_JWKS_CACHE_MAX_AGE_MS,
    },
    {
      isEmailAllowed: async (email) => {
        if (!options.dependencies?.allowlistRepository) {
          throw new Error('PostgreSQL allowlist repository is unavailable');
        }
        return options.dependencies.allowlistRepository.isAllowed(email);
      },
    },
  );

  app.get('/health', { config: { rateLimit: 'disabled' } }, async () =>
    healthResponseSchema.parse({
      status: 'ok',
      service: 'year95-api',
      version: VERSION,
    }),
  );

  app.get('/ready', { config: { rateLimit: 'disabled' } }, async (request, reply) => {
    let isDatabaseReady = false;

    try {
      isDatabaseReady = options.dependencies?.healthRepository
        ? await options.dependencies.healthRepository.isDatabaseReady()
        : false;
    } catch (error: unknown) {
      const diagnostic =
        typeof error === 'object' && error !== null
          ? (error as { name?: unknown; code?: unknown })
          : undefined;
      const errorName =
        typeof diagnostic?.name === 'string' && /^[A-Za-z][A-Za-z0-9]*$/.test(diagnostic.name)
          ? diagnostic.name
          : 'UnknownError';
      const rawCode = diagnostic?.code;
      const errorCode =
        typeof rawCode === 'string' && /^[A-Z0-9_]{1,32}$/.test(rawCode) ? rawCode : 'unknown';

      request.log.warn(
        { errorName, errorCode, errorMessage: error instanceof Error ? error.message : String(error) },
        'Database readiness probe failed',
      );
    }

    const response = readyResponseSchema.parse({
      status: isDatabaseReady ? 'ok' : 'not_ready',
      ready: isDatabaseReady,
      version: VERSION,
      checks: {
        database: isDatabaseReady ? 'ok' : 'not_ready',
      },
    });

    return reply.code(isDatabaseReady ? 200 : 503).send(response);
  });

  app.register(
    async (v1) => {
      v1.get('/me', async (request, reply) => {
        if (!request.user) {
          return reply.code(401).send(
            httpErrorResponseSchema.parse({
              error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
            }),
          );
        }
        return { id: request.user.id, email: request.user.email };
      });

      await options.registerV1Routes?.(v1);
    },
    { prefix: '/v1' },
  );

  return app;
}

/** Backwards-compatible name retained for existing API and integration tests. */
export const createApiApp = buildApp;
