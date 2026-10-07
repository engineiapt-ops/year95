export type NodeEnvironment = "development" | "test" | "production";
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface RuntimeConfig {
  readonly nodeEnv: NodeEnvironment;
  readonly port: number;
  readonly logLevel: LogLevel;
  readonly binanceBaseUrl: string;
  readonly supabaseUrl?: string;
  readonly supabaseServiceRoleKey?: string;
  readonly geminiApiKey?: string;
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

const NODE_ENV_VALUES = new Set<NodeEnvironment>(["development", "test", "production"]);
const LOG_LEVEL_VALUES = new Set<LogLevel>(["debug", "info", "warn", "error"]);

function parsePort(value: string | undefined): number {
  if (value === undefined || value === "") return 3000;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigurationError("PORT must be an integer between 1 and 65535");
  }
  return port;
}

function parseNodeEnv(value: string | undefined): NodeEnvironment {
  const nodeEnv = value ?? "development";
  if (!NODE_ENV_VALUES.has(nodeEnv as NodeEnvironment)) {
    throw new ConfigurationError("NODE_ENV must be development, test or production");
  }
  return nodeEnv as NodeEnvironment;
}

function parseLogLevel(value: string | undefined): LogLevel {
  const logLevel = value ?? "info";
  if (!LOG_LEVEL_VALUES.has(logLevel as LogLevel)) {
    throw new ConfigurationError("LOG_LEVEL must be debug, info, warn or error");
  }
  return logLevel as LogLevel;
}

export function loadConfig(
  env: Record<string, string | undefined>
): RuntimeConfig {
  return {
    nodeEnv: parseNodeEnv(env.NODE_ENV),
    port: parsePort(env.PORT),
    logLevel: parseLogLevel(env.LOG_LEVEL),
    binanceBaseUrl: env.BINANCE_BASE_URL ?? "https://api.binance.com",
    ...(env.SUPABASE_URL ? { supabaseUrl: env.SUPABASE_URL } : {}),
    ...(env.SUPABASE_SERVICE_ROLE_KEY
      ? { supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }
      : {}),
    ...(env.GEMINI_API_KEY ? { geminiApiKey: env.GEMINI_API_KEY } : {})
  };
}
