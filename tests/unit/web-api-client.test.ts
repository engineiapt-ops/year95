import { describe, expect, it, vi } from 'vitest';
import { WebApiClient } from '../../apps/web/src/lib/apiClient.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('WebApiClient', () => {
  it('attaches the current Supabase access token and validates shared contracts', async () => {
    let authorization: string | null = null;
    const client = new WebApiClient({
      baseUrl: 'http://localhost:3000',
      getAccessToken: () => 'signed-access-token',
      onUnauthorized: vi.fn(),
      fetchImpl: async (input, init) => {
        expect(String(input)).toBe('http://localhost:3000/health');
        authorization = new Headers(init?.headers).get('authorization');
        return jsonResponse({ status: 'ok', service: 'year95-api', version: '0.1.0' });
      },
    });
    const health = await client.getHealth();
    expect(authorization).toBe('Bearer signed-access-token');
    expect(health.status).toBe('ok');
  });

  it('handles a 503 readiness response when the shared readiness schema is valid', async () => {
    const client = new WebApiClient({
      baseUrl: 'http://localhost:3000',
      getAccessToken: () => null,
      onUnauthorized: vi.fn(),
      fetchImpl: async () =>
        jsonResponse(
          {
            status: 'not_ready',
            ready: false,
            version: '0.1.0',
            checks: { database: 'not_ready' },
          },
          503,
        ),
    });
    await expect(client.getReadiness()).resolves.toMatchObject({ ready: false });
  });

  it('expires local auth on a 401 from an authenticated request', async () => {
    const onUnauthorized = vi.fn();
    const client = new WebApiClient({
      baseUrl: 'http://localhost:3000',
      getAccessToken: () => 'expired-access-token',
      onUnauthorized,
      fetchImpl: async () =>
        jsonResponse(
          {
            error: { code: 'UNAUTHORIZED', message: 'Invalid or expired access token' },
          },
          401,
        ),
    });
    await expect(client.getMe()).rejects.toMatchObject({ code: 'SESSION_EXPIRED', status: 401 });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('rejects API payloads outside the shared response contract', async () => {
    const client = new WebApiClient({
      baseUrl: 'http://localhost:3000',
      getAccessToken: () => null,
      onUnauthorized: vi.fn(),
      fetchImpl: async () => jsonResponse({ status: 'ok', service: 'bad' }),
    });
    await expect(client.getHealth()).rejects.toThrow('fora do contrato esperado');
  });
});
