import {
  createRemoteJWKSet,
  jwtVerify,
} from "jose";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { httpErrorResponseSchema } from "@year95/contracts";

export interface AuthUser {
  readonly id: string;
  readonly email: string;
}

declare module "fastify" {
  interface FastifyRequest {
    user: AuthUser | null;
  }
}

export interface AuthPluginConfig {
  readonly supabaseUrl?: string | undefined;
  readonly issuer?: string | undefined;
  readonly audience?: string | undefined;
  readonly clockToleranceSeconds?: number | undefined;
  readonly jwksCacheMaxAgeMs?: number | undefined;
  readonly jwksUrl?: string | undefined;
}

export interface AuthPluginDependencies {
  readonly isEmailAllowed: (email: string) => Promise<boolean>;
}

function sendError(
  reply: FastifyReply,
  statusCode: 401 | 403 | 503,
  code: "UNAUTHORIZED" | "FORBIDDEN" | "SERVICE_UNAVAILABLE",
  message: string,
) {
  return reply.code(statusCode).send(httpErrorResponseSchema.parse({ error: { code, message } }));
}

function bearerToken(request: FastifyRequest): string | null {
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string") return null;
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  return match?.[1] ?? null;
}

export function registerAuthPlugin(
  app: FastifyInstance,
  config: AuthPluginConfig,
  dependencies: AuthPluginDependencies,
): void {
  app.decorateRequest("user", null);

  const baseUrl = config.supabaseUrl?.trim().replace(/\/+$/, "");
  const issuer = config.issuer?.trim() || (baseUrl ? `${baseUrl}/auth/v1` : undefined);
  const audience = config.audience?.trim() || "authenticated";
  const clockTolerance = config.clockToleranceSeconds ?? 5;
  const cacheMaxAge = config.jwksCacheMaxAgeMs ?? 300_000;

  let getKey: ReturnType<typeof createRemoteJWKSet> | undefined;
  if (baseUrl && issuer) {
    const jwksUrl = config.jwksUrl ? new URL(config.jwksUrl) : new URL("/auth/v1/.well-known/jwks.json", baseUrl);
    getKey = createRemoteJWKSet(jwksUrl, {
      cacheMaxAge,
      cooldownDuration: 30_000,
      timeoutDuration: 5_000,
    });
  }

  app.addHook("onRequest", async (request, reply) => {
    const path = request.url.split("?")[0] ?? request.url;
    if (path === "/health" || path === "/ready") return;

    const token = bearerToken(request);
    if (!token) {
      return sendError(reply, 401, "UNAUTHORIZED", "Bearer token required");
    }

    if (!getKey || !issuer) {
      return sendError(reply, 503, "SERVICE_UNAVAILABLE", "Authentication is not configured");
    }

    let payload;
    try {
      ({ payload } = await jwtVerify(token, getKey, {
        issuer,
        audience,
        clockTolerance,
      }));
    } catch {
      return sendError(reply, 401, "UNAUTHORIZED", "Invalid or expired access token");
    }

    if (typeof payload.sub !== "string" || payload.sub.length === 0 ||
        typeof payload.email !== "string" || payload.email.trim().length === 0) {
      return sendError(reply, 401, "UNAUTHORIZED", "Access token lacks required identity claims");
    }

    let allowed: boolean;
    try {
      allowed = await dependencies.isEmailAllowed(payload.email);
    } catch {
      request.log.warn("Authentication allowlist lookup failed");
      return sendError(reply, 503, "SERVICE_UNAVAILABLE", "Authentication temporarily unavailable");
    }

    if (!allowed) {
      return sendError(reply, 403, "FORBIDDEN", "User is not allowlisted");
    }

    request.user = { id: payload.sub, email: payload.email };
  });
}
