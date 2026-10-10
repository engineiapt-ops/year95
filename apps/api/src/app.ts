import Fastify, { type FastifyInstance } from "fastify";
import type { ApiConfig } from "@year95/config";
import { healthResponseSchema, readyResponseSchema } from "@year95/contracts";
import { createSupabaseReadinessProbe } from "@year95/persistence";
import { VERSION } from "./index.js";

export interface ApiDependencies {
  readonly databaseReady?: () => Promise<boolean>;
}

export interface ApiAppOptions {
  readonly config: ApiConfig;
  readonly dependencies?: ApiDependencies;
}

export function createApiApp(options: ApiAppOptions): FastifyInstance {
  const { config } = options;
  const app = Fastify({ logger: { level: config.LOG_LEVEL } });
  const databaseReady =
    options.dependencies?.databaseReady ??
    createSupabaseReadinessProbe({
      url: config.SUPABASE_URL,
      secretKey: config.SUPABASE_SECRET_KEY,
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

  return app;
}
