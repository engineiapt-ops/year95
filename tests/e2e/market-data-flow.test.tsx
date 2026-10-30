import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { exportJWK, generateKeyPair, SignJWT, type Session } from 'jose';
import type {
  CandleRepository,
  Instrument,
  InstrumentRepository,
  MarketDataCandle,
  PriceProvider,
  StoredMarketCandle,
} from '@year95/contracts';
import { loadConfig } from '@year95/config';
import { MarketDataSourceRegistry } from '@year95/market-data';
import { buildApp } from '../../apps/api/src/app.js';
import { registerMarketDataRoutes } from '../../apps/api/src/market-data-routes.js';
import { runMarketDataIngestion } from '../../apps/worker/src/ingestion.js';
import { WebApiClient, type FetchLike } from '../../apps/web/src/lib/apiClient.js';
import { App } from '../../apps/web/src/App.js';
import { createMockAuthClient, createMockSession } from '../../apps/web/tests/auth-test-utils.js';

const instrument: Instrument = {
  symbol: 'BTCUSDT',
  displayName: 'Bitcoin / Tether',
  assetType: 'crypto_spot',
  venue: 'binance_spot',
  baseCurrency: 'BTC',
  quoteCurrency: 'USDT',
  enabled: true,
  dataProvider: 'Binance Spot',
  metadataStatus: 'verified',
  metadataSource: 'Binance Spot exchangeInfo endpoint',
  minOrderSize: null,
  maxOrderSize: null,
  leverage: null,
  marginPercent: null,
  spread: null,
  overnightFinancing: null,
  commission: null,
  tradingHours: '24/7',
};

const history: readonly MarketDataCandle[] = [
  {
    openTime: new Date('2026-10-30T01:00:00.000Z'),
    closeTime: new Date('2026-10-30T01:59:59.999Z'),
    open: 100, high: 102, low: 99, close: 101, volume: 10,
  },
  {
    openTime: new Date('2026-10-30T02:00:00.000Z'),
    closeTime: new Date('2026-10-30T02:59:59.999Z'),
    open: 101, high: 103, low: 100, close: 102, volume: 12,
  },
];
const newClosedCandle: MarketDataCandle = {
  openTime: new Date('2026-10-30T03:00:00.000Z'),
  closeTime: new Date('2026-10-30T03:59:59.999Z'),
  open: 102, high: 104, low: 101, close: 103, volume: 15,
};

let activeApp: ReturnType<typeof buildApp> | undefined;
let jwksServer: Server | undefined;

afterEach(async () => {
  if (activeApp) {
    await activeApp.close();
    activeApp = undefined;
  }
  if (jwksServer) {
    await new Promise<void>((resolve, reject) => {
      jwksServer?.close((error) => error ? reject(error) : resolve());
    });
    jwksServer = undefined;
  }
  window.history.replaceState({}, '', '/');
});

describe('market-data ingestion -> API -> authenticated dashboard', () => {
  it('ingests idempotently, exposes all three routes, and blocks stale data in the UI', async () => {
    let currentTime = new Date('2026-10-30T04:00:00.000Z');
    const sourceValidator = new MarketDataSourceRegistry([
      { providerId: 'binance-spot', symbol: 'BTCUSDT', status: 'validated' },
    ]);
    const records = new Map<string, StoredMarketCandle>();
    const repository: CandleRepository = {
      async persistClosedCandles(input) {
        for (const candle of input.candles) {
          records.set(`${input.symbol}:${input.timeframe}:${candle.openTime.toISOString()}`, {
            ...candle, symbol: input.symbol, timeframe: input.timeframe, provider: input.provider,
          });
        }
        return input.candles.length;
      },
      async queryClosedCandles(input) {
        return [...records.values()]
          .filter((candle) => candle.symbol === input.symbol &&
            candle.provider === input.provider && candle.timeframe === input.timeframe)
          .sort((left, right) => left.openTime.getTime() - right.openTime.getTime())
          .slice(-(input.limit ?? 500));
      },
    };
    const provider: PriceProvider = {
      id: 'binance-spot',
      getHistory: async ({ timeframe }) => timeframe === '1h' ? history : [],
      getCandles: async ({ timeframe }) => timeframe === '1h' ? [history[1]!, newClosedCandle] : [],
    };
    const clock = { now: () => new Date(currentTime) };
    const ingestionOptions = {
      symbol: 'BTCUSDT',
      timeframes: ['1h'] as const,
      historyCandles: { '1h': 2 },
    };

    await runMarketDataIngestion(ingestionOptions, { clock, provider, repository, sourceValidator });
    expect(records.size).toBe(3);
    await runMarketDataIngestion(ingestionOptions, { clock, provider, repository, sourceValidator });
    expect(records.size).toBe(3);

    const instrumentRepository: InstrumentRepository = {
      listEnabled: async () => [instrument],
      findBySymbol: async (symbol) => symbol === 'BTCUSDT' ? instrument : null,
    };
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(publicKey);
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        keys: [{ ...publicJwk, kid: 'market-data-test-key', alg: 'RS256', use: 'sig' }],
      }));
    });
    jwksServer = server;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address() as AddressInfo;
    const issuer = 'https://year95.test/auth/v1';
    const token = await new SignJWT({ email: 'trader@example.test' })
      .setProtectedHeader({ alg: 'RS256', kid: 'market-data-test-key' })
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setSubject('00000000-0000-4000-8000-000000000123')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);

    activeApp = buildApp({
      config: loadConfig('api', {
        NODE_ENV: 'test',
        LOG_LEVEL: 'fatal',
        SUPABASE_URL: 'https://year95.test',
        SUPABASE_JWKS_URL: `http://127.0.0.1:${address.port}/.well-known/jwks.json`,
        SUPABASE_JWT_ISSUER: issuer,
      }),
      dependencies: {
        allowlistRepository: { isAllowed: async () => true },
        healthRepository: { isDatabaseReady: async () => true },
      },
      registerV1Routes(v1) {
        registerMarketDataRoutes(v1, {
          instrumentRepository,
          candleRepository: repository,
          sourceValidator,
          clock,
        });
      },
    });
    await activeApp.ready();

    const fetchImpl: FetchLike = async (input, init) => {
      const url = new URL(String(input));
      const headers = Object.fromEntries(new Headers(init?.headers).entries());
      const injected = await activeApp!.inject({
        method: 'GET',
        url: `${url.pathname}${url.search}`,
        headers,
      });
      return new Response(injected.body, {
        status: injected.statusCode,
        headers: { 'content-type': 'application/json' },
      });
    };
    const apiClient = new WebApiClient({
      baseUrl: 'http://year95-api.test',
      getAccessToken: () => token,
      onUnauthorized: async () => undefined,
      fetchImpl,
    });
    const session = { ...createMockSession(), access_token: token } as Session;
    const authClient = createMockAuthClient(session);

    const firstRender = render(<App authClient={authClient} apiClient={apiClient} />);
    expect(await screen.findByText('Fresh')).toBeTruthy();
    expect(await screen.findByText('102.00')).toBeTruthy();
    expect(records.size).toBe(3);

    firstRender.unmount();
    currentTime = new Date('2026-10-30T10:00:00.000Z');
    render(<App authClient={authClient} apiClient={apiClient} />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Dados desatualizados — uso bloqueado')).toBeTruthy();
    expect(screen.queryByText('Fresh')).toBeNull();

    const instruments = await apiClient.getInstruments();
    const candles = await apiClient.getMarketCandles('BTCUSDT', '1h', 10);
    const quality = await apiClient.getMarketQuality('BTCUSDT', '1h');
    expect(instruments.items.map((item) => item.symbol)).toEqual(['BTCUSDT']);
    expect(candles.candles).toHaveLength(3);
    expect(quality).toMatchObject({ status: 'stale', blocked: true });
  });
});
