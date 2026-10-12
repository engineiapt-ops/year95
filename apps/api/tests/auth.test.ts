import Fastify from "fastify";
import { generateKeyPair, exportJWK, SignJWT, type JWK } from "jose";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { registerAuthPlugin } from "../src/plugins/auth.js";

const apps: ReturnType<typeof Fastify>[] = [];
const servers: Server[] = [];

async function setup(options: {
  readonly allowlisted?: boolean | 'fail';
  readonly issuer?: string;
  readonly tokenIssuer?: string;
  readonly tokenAudience?: string;
  readonly tokenEmail?: string;
  readonly omitSub?: boolean;
  readonly expired?: boolean;
  readonly wrongSignature?: boolean;
  readonly captureLogs?: (chunk: string) => void;
} = {}) {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const otherPair = options.wrongSignature ? await generateKeyPair("RS256") : undefined;
  const jwk = await exportJWK(publicKey);
  const jwks: JWK = { ...jwk, kid: "test-key", alg: "RS256", use: "sig" };
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ keys: [jwks] }));
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;

  const app = options.captureLogs
    ? Fastify({
        logger: {
          level: "info",
          stream: new Writable({
            write(chunk, _encoding, callback) {
              options.captureLogs?.(String(chunk));
              callback();
            },
          }),
        },
      })
    : Fastify({ logger: false });
  apps.push(app);

  registerAuthPlugin(app, {
    supabaseUrl: "https://example.supabase.co",
    jwksUrl: `http://127.0.0.1:${address.port}/.well-known/jwks.json`,
    issuer: options.issuer ?? "https://example.supabase.co/auth/v1",
    audience: "authenticated",
    clockToleranceSeconds: 0,
    jwksCacheMaxAgeMs: 60_000,
  }, {
    isEmailAllowed: async () => {
      if (options.allowlisted === 'fail') throw new Error('Database connection failed');
      return options.allowlisted === undefined ? true : (options.allowlisted === true);
    },
  });

  app.get("/health", async () => ({ status: "ok" }));
  app.get("/ready", async () => ({ status: "ok" }));
  app.get("/v1/me", async (request) => ({ id: request.user?.id, email: request.user?.email }));

  const signer = options.wrongSignature ? otherPair!.privateKey : privateKey;
  let tokenBuilder = new SignJWT({ email: options.tokenEmail !== undefined ? options.tokenEmail : "user@example.com" })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(options.tokenIssuer ?? "https://example.supabase.co/auth/v1")
    .setAudience(options.tokenAudience ?? "authenticated")
    .setIssuedAt();

  if (!options.omitSub) {
    tokenBuilder = tokenBuilder.setSubject("user-123");
  }

  if (options.expired) tokenBuilder = tokenBuilder.setExpirationTime(Math.floor(Date.now() / 1000) - 30);
  else tokenBuilder = tokenBuilder.setExpirationTime(Math.floor(Date.now() / 1000) + 300);
  const token = await tokenBuilder.sign(signer);
  return { app, token };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe("Supabase JWT authentication contract", () => {
  it("rejects missing bearer tokens on non-public routes and keeps health/readiness public", async () => {
    const { app } = await setup();
    for (const url of ["/v1/me", "/v1/unknown", "/unknown"]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    }
    expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/ready" })).statusCode).toBe(200);
  });

  it("accepts a valid signature and returns the authenticated identity", async () => {
    const { app, token } = await setup();
    const response = await app.inject({ method: "GET", url: "/v1/me", headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: "user-123", email: "user@example.com" });
  });

  it("rejects expired tokens", async () => {
    const { app, token } = await setup({ expired: true });
    const response = await app.inject({ method: "GET", url: "/v1/me", headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(401);
  });

  it("rejects tokens with an invalid signature", async () => {
    const { app, token } = await setup({ wrongSignature: true });
    const response = await app.inject({ method: "GET", url: "/v1/me", headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(401);
  });

  it("rejects an incorrect issuer", async () => {
    const { app, token } = await setup({ tokenIssuer: "https://attacker.example" });
    const response = await app.inject({ method: "GET", url: "/v1/me", headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(401);
  });

  it("forbids users outside the allowlist", async () => {
    const { app, token } = await setup({ allowlisted: false });
    const response = await app.inject({ method: "GET", url: "/v1/me", headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  });

  it("never writes bearer tokens to request logs", async () => {
    let logs = "";
    const { app, token } = await setup({ expired: true, captureLogs: (chunk) => { logs += chunk; } });
    await app.inject({ method: "GET", url: "/v1/me", headers: { authorization: `Bearer ${token}` } });
    expect(logs).not.toContain(token);
  });

  it("fails closed with 503 if the allowlist query fails", async () => {
    const { app, token } = await setup({ allowlisted: 'fail' });
    const response = await app.inject({ method: "GET", url: "/v1/me", headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: { code: "SERVICE_UNAVAILABLE" } });
  });

  it("rejects tokens with missing sub claims", async () => {
    const { app, token } = await setup({ omitSub: true });
    const response = await app.inject({ method: "GET", url: "/v1/me", headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(401);
  });

  it("rejects tokens with missing email claims", async () => {
    const { app, token } = await setup({ tokenEmail: "" });
    const response = await app.inject({ method: "GET", url: "/v1/me", headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(401);
  });

  it("rejects tokens with an incorrect audience", async () => {
    const { app, token } = await setup({ tokenAudience: "public" });
    const response = await app.inject({ method: "GET", url: "/v1/me", headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(401);
  });
});
