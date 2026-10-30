import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import type {
  CandleRepository,
  Clock,
  Instrument,
  InstrumentRepository,
  StoredMarketCandle,
} from '@year95/contracts';
import { marketCandlesResponseSchema, marketDataQualityResponseSchema, marketInstrumentsResponseSchema } from '@year95/contracts';
import type { MarketDataSourceValidator } from '@year95/market-data';
import { registerMarketDataRoutes } from '../src/market-data-routes.js';

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
const freshCandle: StoredMarketCandle = {
  symbol: 'BTCUSDT',
  timeframe: '1h',
  provider: 'binance-spot',
  openTime: new Date('2026-10-30T02:00:00.000Z'),
  closeTime: new Date('2026-10-30T02:59:59.999Z'),
  open: 100,
  high: 103,
  low: 99,
  close: 102,
  volume: 12,
};

describe('market-data HTTP contracts', () => {
  it('returns only validated instruments, closed candles and a freshness result', async () => {
    let stored: readonly StoredMarketCandle[] = [freshCandle];
    const instrumentRepository: InstrumentRepository = {
      listEnabled: async () => [instrument],
      findBySymbol: async (symbol) => symbol === 'BTCUSDT' ? instrument : null,
    };
    const candleRepository: CandleRepository = {
      persistClosedCandles: async () => 0,
      queryClosedCandles: async (input) => stored
        .filter((candle) => candle.symbol === input.symbol && candle.provider === input.provider && candle.timeframe === input.timeframe)
        .slice(- (input.limit ?? 500)),
    };
    const sourceValidator: MarketDataSourceValidator = {
      assertValidated: (providerId, symbol) => {
        if (providerId !== 'binance-spot' || symbol !== 'BTCUSDT') throw new Error('source not validated');
      },
    };
    const clock: Clock = { now: () => new Date('2026-10-30T03:00:00.000Z') };
    const app = Fastify();
    app.register(async (v1) => {
      registerMarketDataRoutes(v1, { instrumentRepository, candleRepository, sourceValidator, clock });
    }, { prefix: '/v1' });
    await app.ready();

    try {
      const instruments = await app.inject({ method: 'GET', url: '/v1/instruments' });
      expect(instruments.statusCode).toBe(200);
      expect(marketInstrumentsResponseSchema.parse(instruments.json())).toMatchObject({
        items: [{ symbol: 'BTCUSDT', providerId: 'binance-spot' }],
      });

      const candles = await app.inject({ method: 'GET', url: '/v1/market/BTCUSDT/candles?tf=1h&limit=10' });
      expect(candles.statusCode).toBe(200);
      expect(marketCandlesResponseSchema.parse(candles.json()).candles).toHaveLength(1);

      const quality = await app.inject({ method: 'GET', url: '/v1/market/BTCUSDT/quality?tf=1h' });
      expect(quality.statusCode).toBe(200);
      expect(marketDataQualityResponseSchema.parse(quality.json())).toMatchObject({
        status: 'fresh', blocked: false, blockReason: null,
      });

      stored = [];
      const emptyQuality = await app.inject({ method: 'GET', url: '/v1/market/BTCUSDT/quality?tf=1h' });
      expect(marketDataQualityResponseSchema.parse(emptyQuality.json())).toMatchObject({
        status: 'no_data', blocked: true, blockReason: 'NO_CLOSED_CANDLES',
      });
    } finally {
      await app.close();
    }
  });

  it('blocks stale data and rejects invalid timeframe, limit and unapproved instrument requests', async () => {
    const staleCandle = {
      ...freshCandle,
      closeTime: new Date('2026-10-30T00:00:00.000Z'),
    };
    const instrumentRepository: InstrumentRepository = {
      listEnabled: async () => [instrument],
      findBySymbol: async (symbol) => symbol === 'BTCUSDT' ? instrument : null,
    };
    const candleRepository: CandleRepository = {
      persistClosedCandles: async () => 0,
      queryClosedCandles: async () => [staleCandle],
    };
    const sourceValidator: MarketDataSourceValidator = { assertValidated: () => undefined };
    const app = Fastify();
    app.register(async (v1) => {
      registerMarketDataRoutes(v1, {
        instrumentRepository,
        candleRepository,
        sourceValidator,
        clock: { now: () => new Date('2026-10-30T03:00:00.000Z') },
      });
    }, { prefix: '/v1' });
    await app.ready();

    try {
      const quality = await app.inject({ method: 'GET', url: '/v1/market/BTCUSDT/quality?tf=1h' });
      expect(marketDataQualityResponseSchema.parse(quality.json())).toMatchObject({
        status: 'stale', blocked: true, blockReason: 'STALE_MARKET_DATA',
      });
      expect((await app.inject({ method: 'GET', url: '/v1/market/BTCUSDT/quality?tf=15m' })).statusCode).toBe(400);
      expect((await app.inject({ method: 'GET', url: '/v1/market/BTCUSDT/candles?tf=1h&limit=1001' })).statusCode).toBe(400);
      expect((await app.inject({ method: 'GET', url: '/v1/market/ETHUSDT/candles?tf=1h' })).statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
