import { describe, expect, it } from "vitest";
import { ConfigValidationError, loadConfig, serializeConfig } from "../../packages/config/src/index.js";

describe("config", () => {
  it("aggregates every invalid field", () => {
    try {
      loadConfig("api", {
        NODE_ENV: "invalid",
        PORT: "not-a-port",
        BINANCE_BASE_URL: "not-a-url",
        DECISION_MIN_CONFIDENCE: "2",
        DECISION_MIN_PROBABILIDADE: "-1",
        FIXED_POSITION_PCT: "101",
      });
      throw new Error("expected configuration validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      const issues = (error as ConfigValidationError).issues;
      expect(issues.map((issue) => issue.path[0])).toEqual(
        expect.arrayContaining([
          "NODE_ENV",
          "PORT",
          "BINANCE_BASE_URL",
          "DECISION_MIN_CONFIDENCE",
          "DECISION_MIN_PROBABILIDADE",
          "FIXED_POSITION_PCT",
        ]),
      );
      expect(issues).toHaveLength(6);
    }
  });

  it("applies deterministic defaults", () => {
    const config = loadConfig("api", {});
    expect(config.NODE_ENV).toBe("development");
    expect(config.PORT).toBe(3000);
    expect(config.LOG_LEVEL).toBe("info");
    expect(config.BINANCE_BASE_URL).toBe("https://api.binance.com");
    expect(config.DECISION_MIN_CONFIDENCE).toBe(0.68);
    expect(config.DECISION_MIN_PROBABILIDADE).toBe(0.62);
    expect(config.DECISION_BLOQUEAR_RISCO_ELEVADO).toBe(true);
    expect(config.FIXED_POSITION_PCT).toBe(1.5);
  });

  it("never exposes secrets through JSON serialization", () => {
    const config = loadConfig("api", {
      SUPABASE_SERVICE_ROLE_KEY: "super-secret",
      GEMINI_API_KEY: "gemini-secret",
      API_AUTH_TOKEN: "auth-secret",
      CRON_SECRET: "cron-secret",
    });

    const serialized = JSON.stringify(config);
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("gemini-secret");
    expect(serialized).not.toContain("auth-secret");
    expect(serialized).not.toContain("cron-secret");
    expect(serialized).toContain("[REDACTED]");
    expect(serializeConfig(config)).not.toContain("super-secret");
  });
});
