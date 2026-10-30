import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import type { DashboardApi } from '../src/pages/DashboardPage.js';
import type { FetchLike } from '../src/lib/apiClient.js';
import { createMockAuthClient, createMockSession } from './auth-test-utils.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  window.history.replaceState({}, '', '/');
  vi.restoreAllMocks();
});

function makeApiClient(overrides: Partial<DashboardApi> = {}): DashboardApi {
  return {
    getHealth: vi.fn().mockResolvedValue({
      status: 'ok',
      service: 'year95-api',
      version: '0.1.0',
    }),
    getReadiness: vi.fn().mockResolvedValue({
      status: 'ok',
      ready: true,
      version: '0.1.0',
      checks: { database: 'ok' },
    }),
    getMe: vi.fn().mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000123',
      email: 'trader@example.test',
    }),
    getInstruments: vi.fn().mockResolvedValue({
      items: [{
        symbol: 'BTCUSDT',
        displayName: 'Bitcoin / Tether',
        assetType: 'crypto_spot',
        venue: 'binance_spot',
        baseCurrency: 'BTC',
        quoteCurrency: 'USDT',
        providerId: 'binance-spot',
        timeframes: ['1h', '4h', '1d'],
      }],
    }),
    getMarketCandles: vi.fn().mockResolvedValue({
      symbol: 'BTCUSDT',
      timeframe: '1h',
      providerId: 'binance-spot',
      dataAsOf: '2026-10-30T02:59:59.999Z',
      candles: [
        { openTime: '2026-10-30T01:00:00.000Z', closeTime: '2026-10-30T01:59:59.999Z', open: 100, high: 102, low: 99, close: 101, volume: 10 },
        { openTime: '2026-10-30T02:00:00.000Z', closeTime: '2026-10-30T02:59:59.999Z', open: 101, high: 103, low: 100, close: 102, volume: 12 },
      ],
    }),
    getMarketQuality: vi.fn().mockResolvedValue({
      symbol: 'BTCUSDT',
      timeframe: '1h',
      providerId: 'binance-spot',
      status: 'fresh',
      blocked: false,
      blockReason: null,
      checkedAt: '2026-10-30T03:00:00.000Z',
      dataAsOf: '2026-10-30T02:59:59.999Z',
      ageMs: 1,
      maxAgeMs: 5400000,
    }),
    ...overrides,
  };
}

describe('web shell route protection and states', () => {
  it('redirects an unauthenticated visitor to login', async () => {
    render(<App authClient={createMockAuthClient(null)} apiClient={makeApiClient()} />);

    expect(await screen.findByRole('heading', { name: 'YEAR95' })).toBeTruthy();
    expect(screen.getByLabelText('E-mail')).toBeTruthy();
  });

  it('shows an auth loading state while session recovery is pending', () => {
    const authClient = createMockAuthClient(null);
    vi.spyOn(authClient.auth, 'getSession').mockReturnValue(new Promise(() => undefined));

    render(<App authClient={authClient} apiClient={makeApiClient()} />);

    expect(screen.getByRole('status').textContent).toContain('Verificando sessão');
  });

  it('renders API health, database readiness, and API-verified user', async () => {
    render(
      <App authClient={createMockAuthClient(createMockSession())} apiClient={makeApiClient()} />,
    );

    expect(await screen.findByText('Online')).toBeTruthy();
    expect(screen.getByText('Pronto')).toBeTruthy();
    expect(screen.getByText('trader@example.test')).toBeTruthy();
  });

  it('shows a database-not-ready state separately from API health', async () => {
    const api = makeApiClient({
      getReadiness: vi.fn().mockResolvedValue({
        status: 'not_ready',
        ready: false,
        version: '0.1.0',
        checks: { database: 'not_ready' },
      }),
    });

    render(<App authClient={createMockAuthClient(createMockSession())} apiClient={api} />);

    expect(await screen.findByText('Online')).toBeTruthy();
    expect(await screen.findByText('Não pronto')).toBeTruthy();
  });

  it('shows login errors without exposing the protected dashboard', async () => {
    render(<App authClient={createMockAuthClient(null)} apiClient={makeApiClient()} />);
    await screen.findByRole('heading', { name: 'YEAR95' });

    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'bad@example.test' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Visão geral')).toBeNull();
  });

  it('shows a clear failure state when the API cannot be reached', async () => {
    const api = makeApiClient({
      getHealth: vi.fn().mockRejectedValue(new Error('API indisponível')),
    });

    render(<App authClient={createMockAuthClient(createMockSession())} apiClient={api} />);

    expect(await screen.findByText('Indisponível')).toBeTruthy();
    expect(screen.getByText('API indisponível')).toBeTruthy();
  });

  it('clears the session and redirects to login when the API rejects an expired JWT', async () => {
    const authClient = createMockAuthClient(createMockSession());
    const requestedPaths: string[] = [];
    const fetchImpl: FetchLike = async (input) => {
      const pathname = new URL(String(input)).pathname;
      requestedPaths.push(pathname);

      if (pathname === '/health') {
        return jsonResponse({ status: 'ok', service: 'year95-api', version: '0.1.0' });
      }

      if (pathname === '/ready') {
        return jsonResponse({
          status: 'ok',
          ready: true,
          version: '0.1.0',
          checks: { database: 'ok' },
        });
      }

      return jsonResponse(
        { error: { code: 'UNAUTHORIZED', message: 'Invalid or expired access token' } },
        401,
      );
    };

    render(
      <App
        authClient={authClient}
        apiClientOptions={{ baseUrl: 'http://localhost:3000', fetchImpl }}
      />,
    );

    expect(
      await screen.findByText('Sua sessão expirou. Entre novamente para continuar.'),
    ).toBeTruthy();
    expect(screen.queryByText('Visão geral')).toBeNull();
    expect(requestedPaths).toContain('/v1/me');
  });
});
