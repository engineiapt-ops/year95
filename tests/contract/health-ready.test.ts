import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION, healthResponseSchema, readyResponseSchema } from "../../packages/contracts/src/index.js";

describe("health/readiness contracts", () => {
  it("accepts the versioned health response", () => {
    expect(
      healthResponseSchema.safeParse({
        status: "ok",
        service: "year95-api",
        version: CONTRACT_VERSION,
      }).success,
    ).toBe(true);
  });

  it("rejects an invalid health response", () => {
    expect(
      healthResponseSchema.safeParse({
        status: "degraded",
        service: "year95-api",
        version: CONTRACT_VERSION,
      }).success,
    ).toBe(false);
  });

  it("accepts readiness when every check is healthy", () => {
    expect(
      readyResponseSchema.safeParse({
        status: "ok",
        ready: true,
        version: CONTRACT_VERSION,
        checks: { database: "ok", marketData: "ok" },
      }).success,
    ).toBe(true);
  });

  it("accepts a not-ready response when a check is unavailable", () => {
    expect(
      readyResponseSchema.safeParse({
        status: "not_ready",
        ready: false,
        version: CONTRACT_VERSION,
        checks: { database: "not_ready" },
      }).success,
    ).toBe(true);
  });
});
