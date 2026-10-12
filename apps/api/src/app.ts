import Fastify, { type FastifyInstance } from "fastify";
import type { ApiConfig } from "@year95/config";
import { healthResponseSchema, httpErrorResponseSchema, readyResponseSchema } from "@year95/contracts";
import { createSupabaseServerAccess } from "@year95/persistence";
import { registerAuthPlugin } from "./plugins/auth.js";
import { VERSION } from "./index.js";

export interface ApiDependencies {
  readonly databaseReady?: () => Promise<boolean>;
  readonly isEmailAllowed?: (email: string) => Promise<boolean>;
}

export interface ApiAppOptions {
  readonly config: ApiConfig;
  readonly dependencies?: ApiDependencies;
}

export function createApiApp(options: ApiAppOptions): FastifyInstance {
  const { config } = options;
  const app = Fastify({ logger: { level: config.LOG_LEVEL } });
  const supabaseAccess = createSupabaseServerAccess(config);
  const databaseReady = options.dependencies?.databaseReady ?? supabaseAccess.databaseReady;

  registerAuthPlugin(app, {
    supabaseUrl: config.SUPABASE_URL,
    issuer: config.SUPABASE_JWT_ISSUER,
    audience: config.SUPABASE_JWT_AUDIENCE,
    clockToleranceSeconds: config.SUPABASE_JWT_CLOCK_TOLERANCE_SECONDS,
    jwksCacheMaxAgeMs: config.SUPABASE_JWKS_CACHE_MAX_AGE_MS,
  }, {
    isEmailAllowed: options.dependencies?.isEmailAllowed ?? supabaseAccess.isEmailAllowed,
  });

  app.get("/health", async () =>
    healthResponseSchema.parse({
      status: "ok",
      service: "year95-api",
      version: VERSION,
    }),
  );

  app.get("/ready", async (request, reply) => {
    let isDatabaseReady = false;

    try {
      isDatabaseReady = await databaseReady();
    } catch {
      request.log.warn("Database readiness probe failed");
    }

    const response = readyResponseSchema.parse({
      status: isDatabaseReady ? "ok" : "not_ready",
      ready: isDatabaseReady,
      version: VERSION,
      checks: {
        database: isDatabaseReady ? "ok" : "not_ready",
      },
    });

    return reply.code(isDatabaseReady ? 200 : 503).send(response);
  });

  app.get("/v1/me", async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send(httpErrorResponseSchema.parse({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }));
    }
    return { id: request.user.id, email: request.user.email };
  });

  return app;
}
