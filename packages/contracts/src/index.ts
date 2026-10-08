import { z } from "zod";

export const CONTRACT_VERSION = "1.0.0" as const;

export type Result<T, E = DomainError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const HTTP_ERROR_CODES = {
  BAD_REQUEST: "BAD_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  UNPROCESSABLE_ENTITY: "UNPROCESSABLE_ENTITY",
  TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
} as const;

export type HttpErrorCode = (typeof HTTP_ERROR_CODES)[keyof typeof HTTP_ERROR_CODES];

export const HTTP_STATUS_BY_ERROR: Readonly<Record<HttpErrorCode, number>> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

export class DomainError extends Error {
  readonly code: HttpErrorCode;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    code: HttpErrorCode,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }
}

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string().min(1),
  version: z.string().min(1),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const readyResponseSchema = z.object({
  status: z.enum(["ok", "not_ready"]),
  ready: z.boolean(),
  version: z.string().min(1),
  checks: z.record(z.string(), z.enum(["ok", "not_ready"])),
});

export type ReadyResponse = z.infer<typeof readyResponseSchema>;

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = Object.freeze({
  now: () => new Date(),
});
