import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../packages/config/src/index.js";
import { healthResponseSchema, readyResponseSchema } from "../../packages/contracts/src/index.js";
import { createApiApp } from "../../apps/api/src/app.js";
import { VERSION } from "../../apps/api/src/index.js";

const apps: ReturnType<typeof createApiApp>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("YEAR95 API runtime", () => {
  it("returns the versioned health contract without requiring database credentials", async () => {
    const app = createApiApp({
      config: loadConfig("api", { NODE_ENV: "test" }),
      dependencies: { databaseReady: async () => false },
    });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(
      healthResponseSchema.parse(JSON.parse(response.body) as unknown),
    ).toEqual({
      status: "ok",
      service: "year95-api",
      version: VERSION,
    });
  });

  it("returns not-ready and HTTP 503 when the database is unavailable", async () => {
    const app = createApiApp({
      config: loadConfig("api", { NODE_ENV: "test" }),
      dependencies: { databaseReady: async () => false },
    });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(503);
    expect(readyResponseSchema.parse(JSON.parse(response.body) as unknown)).toEqual({
      status: "not_ready",
      ready: false,
      version: VERSION,
      checks: { database: "not_ready" },
    });
  });

  it("returns ready only when the injected database probe succeeds", async () => {
    const app = createApiApp({
      config: loadConfig("api", { NODE_ENV: "test" }),
      dependencies: { databaseReady: async () => true },
    });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(200);
    expect(readyResponseSchema.parse(JSON.parse(response.body) as unknown)).toEqual({
      status: "ok",
      ready: true,
      version: VERSION,
      checks: { database: "ok" },
    });
  });

  it("fails closed if the injected database probe throws", async () => {
    const app = createApiApp({
      config: loadConfig("api", { NODE_ENV: "test" }),
      dependencies: {
        databaseReady: async () => {
          throw new Error("private diagnostic");
        },
      },
    });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain("private diagnostic");
  });
});
