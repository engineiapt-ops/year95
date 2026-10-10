import { z } from "zod";

export type ConfigEnv = Readonly<Record<string, string | undefined>>;

export const PUBLIC_ENV_NAMES = [
  "VITE_API_BASE_URL",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
] as const;

export const SECRET_ENV_NAMES = [
  "SUPABASE_SECRET_KEY",
  "GEMINI_API_KEY",
  "CRON_SECRET",
  "IG_API_KEY",
  "IG_USERNAME",
  "IG_PASSWORD",
  "SAXO_CLIENT_ID",
  "SAXO_CLIENT_SECRET",
  "SAXO_ACCESS_TOKEN",
  "GOOGLE_API_KEY",
  "AI_GATEWAY_API_KEY",
  "CRYPTOPANIC_API_KEY",
  "VERCEL_OIDC_TOKEN",
] as const;

const secretKeys = new Set<string>(SECRET_ENV_NAMES);
const publicKeys = new Set<string>(PUBLIC_ENV_NAMES);

const envText = z.string().trim().min(1);
const urlText = envText.url();

const nodeEnv = z.enum(["development", "test", "production"]).default("development");
const logLevel = z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info");

const booleanText = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return value;
}, z.boolean());

const baseRuntimeSchema = z.object({
  NODE_ENV: nodeEnv,
  LOG_LEVEL: logLevel,
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});

const quantitativeSchema = {
  DECISION_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.68),
  DECISION_MIN_PROBABILIDADE: z.coerce.number().min(0).max(1).default(0.62),
  DECISION_BLOQUEAR_RISCO_ELEVADO: booleanText.default(true),
  FIXED_POSITION_PCT: z.coerce.number().min(0).max(100).default(1.5),
};

export const apiConfigSchema = baseRuntimeSchema.extend({
  BINANCE_BASE_URL: urlText.default("https://api.binance.com"),
  SUPABASE_URL: urlText.optional(),
  SUPABASE_SECRET_KEY: envText.optional(),
  SUPABASE_JWT_ISSUER: urlText.optional(),
  SUPABASE_JWT_AUDIENCE: envText.default("authenticated"),
  SUPABASE_JWT_CLOCK_TOLERANCE_SECONDS: z.coerce.number().int().min(0).max(60).default(5),
  SUPABASE_JWKS_CACHE_MAX_AGE_MS: z.coerce.number().int().min(1000).max(3600000).default(300000),
  GEMINI_API_KEY: envText.optional(),
  CRON_SECRET: envText.optional(),
  ...quantitativeSchema,
});

export const workerConfigSchema = baseRuntimeSchema.extend({
  BINANCE_BASE_URL: urlText.default("https://api.binance.com"),
  SUPABASE_URL: urlText.optional(),
  SUPABASE_SECRET_KEY: envText.optional(),
  GEMINI_API_KEY: envText.optional(),
  ...quantitativeSchema,
});

export const webPublicConfigSchema = z.object({
  NODE_ENV: nodeEnv,
  VITE_API_BASE_URL: urlText.optional(),
  VITE_SUPABASE_URL: urlText.optional(),
  VITE_SUPABASE_ANON_KEY: envText.optional(),
});

export type ApiConfig = z.infer<typeof apiConfigSchema>;
export type WorkerConfig = z.infer<typeof workerConfigSchema>;
export type WebPublicConfig = z.infer<typeof webPublicConfigSchema>;

export class ConfigValidationError extends Error {
  readonly issues: readonly z.ZodIssue[];

  constructor(app: string, issues: readonly z.ZodIssue[]) {
    super(
      `Invalid ${app} configuration: ${issues
        .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
        .join("; ")}`,
    );
    this.name = "ConfigValidationError";
    this.issues = issues;
  }
}

function schemaForApp(app: "api" | "worker" | "web-public") {
  if (app === "api") return apiConfigSchema;
  if (app === "worker") return workerConfigSchema;
  return webPublicConfigSchema;
}

function redactValue(key: string, value: unknown): unknown {
  if (secretKeys.has(key) || /(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|API_KEY)$/i.test(key)) {
    return value === undefined ? undefined : "[REDACTED]";
  }
  if (publicKeys.has(key)) return value;
  if (Array.isArray(value)) return value.map((item) => redactValue("", item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redactValue(entryKey, entryValue)]),
    );
  }
  return value;
}

export function redactConfig<T extends object>(config: T): Record<string, unknown> {
  return redactValue("", config) as Record<string, unknown>;
}

export function serializeConfig(config: object): string {
  return JSON.stringify(redactConfig(config));
}

function attachSafeSerialization<T extends object>(config: T): T {
  Object.defineProperty(config, "toJSON", {
    enumerable: false,
    value: () => redactConfig(config),
  });
  return config;
}

export function loadConfig<E extends ConfigEnv>(app: "api", env: E): ApiConfig;
export function loadConfig<E extends ConfigEnv>(app: "worker", env: E): WorkerConfig;
export function loadConfig<E extends ConfigEnv>(app: "web-public", env: E): WebPublicConfig;
export function loadConfig(
  app: "api" | "worker" | "web-public",
  env: ConfigEnv,
): ApiConfig | WorkerConfig | WebPublicConfig {
  const parsed = schemaForApp(app).safeParse(env);
  if (!parsed.success) {
    throw new ConfigValidationError(app, parsed.error.issues);
  }
  return attachSafeSerialization(parsed.data);
}

export function publicEnv(env: ConfigEnv): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (publicKeys.has(key) && value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}
