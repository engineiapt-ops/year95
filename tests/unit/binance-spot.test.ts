import { describe, expect, it } from 'vitest';
import {
  assertLatestCandleFresh,
  evaluateLatestCandleFreshness,
  InvalidMarketDataError,
  MarketDataStaleError,
  maxMarketDataAgeMs,
  type MarketCandle,
} from '@year95/market-data';
import {
  BinanceSpotProvider,
  BinanceSpotProviderError,
} from '../../packages/providers/src/binance-spot.js';

const checkedAtMs = Date.parse('2026-10-13T14:00:00.000Z');
const baseUrl = 'https://api.binance.test';

function rawCandle(openTime: string, closeTime: string, close = '105'): unknown[] {
  return [
    Date.parse(openTime),
    '100',
    '110',
    '90',
    close,
    '12.5',
    Date.parse(closeTime),
    '1000',
    10,
    '5',
    '500',
    '0',
  ];
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function makeProvider(
  fetchImpl: typeof fetch,
  now = new Date(checkedAtMs),
): BinanceSpotProvider {
  return new BinanceSpotProvider({
    baseUrl,
    fetchImpl,
    now: () => new Date(now),
  });
}

describe('Binance Spot adapter', () => {
  it.each(['1h', '4h', '1d'] as const)(
    'maps %s candles and excludes an in-progress kline',
    async (timeframe) => {
      let requestedUrl: URL | undefined;
      const fetchImpl: typeof fetch = async (input) => {
        requestedUrl = new URL(String(input));
        return jsonResponse([
          rawCandle('2026-10-13T12:00:00.000Z', '2026-10-13T12:59:59.999Z'),
          rawCandle('2026-10-13T13:00:00.000Z', '2026-10-13T13:59:59.999Z'),
          rawCandle('2026-10-13T14:00:00.000Z', '2026-10-13T14:59:59.999Z', '999'),
        ]);
      };
      const provider = makeProvider(fetchImpl);

      const candles = await provider.getCandles({
        symbol: 'btcusdt',
        timeframe,
        limit: 2_000,
        startTime: Date.parse('2026-10-13T12:00:00.000Z'),
        endTime: checkedAtMs,
      });

      expect(requestedUrl?.pathname).toBe('/api/v3/klines');
      expect(requestedUrl?.searchParams.get('symbol')).toBe('BTCUSDT');
      expect(requestedUrl?.searchParams.get('interval')).toBe(timeframe);
      expect(requestedUrl?.searchParams.get('limit')).toBe('1000');
      expect(requestedUrl?.searchParams.get('startTime')).toBe(
        String(Date.parse('2026-10-13T12:00:00.000Z')),
      );
      expect(requestedUrl?.searchParams.get('endTime')).toBe(String(checkedAtMs));
      expect(candles).toHaveLength(2);
      expect(candles[0]).toEqual({
        openTime: new Date('2026-10-13T12:00:00.000Z'),
        closeTime: new Date('2026-10-13T12:59:59.999Z'),
        open: 100,
        high: 110,
        low: 90,
        close: 105,
        volume: 12.5,
      });
      expect(candles.every((candle) => candle.closeTime.getTime() <= checkedAtMs)).toBe(true);
    },
  );

  it('rejects symbols outside the initially verified instrument mapping before making HTTP requests', async () => {
    let callCount = 0;
    const provider = makeProvider(async () => {
      callCount += 1;
      return jsonResponse([]);
    });

    await expect(
      provider.getCandles({ symbol: 'ETHUSDT', timeframe: '1h' }),
    ).rejects.toMatchObject({
      code: 'UNSUPPORTED_SYMBOL',
    });
    expect(callCount).toBe(0);
  });

  it('rejects unsupported timeframes before making HTTP requests', async () => {
    let callCount = 0;
    const provider = makeProvider(async () => {
      callCount += 1;
      return jsonResponse([]);
    });

    await expect(
      provider.getCandles({ symbol: 'BTCUSDT', timeframe: '15m' as '1h' }),
    ).rejects.toMatchObject<Partial<BinanceSpotProviderError>>({
      code: 'UNSUPPORTED_TIMEFRAME',
    });
    expect(callCount).toBe(0);
  });

  it('returns a typed safe error for an HTTP failure without echoing the response body', async () => {
    const provider = makeProvider(async () => jsonResponse({ secret: 'do-not-echo' }, 429));

    await expect(
      provider.getCandles({ symbol: 'BTCUSDT', timeframe: '1h' }),
    ).rejects.toMatchObject({
      name: 'BinanceSpotProviderError',
      code: 'HTTP_ERROR',
      httpStatus: 429,
      message: 'Binance Spot returned HTTP 429',
    });
  });

  it('rejects malformed rows, non-finite prices, and inconsistent OHLC values', async () => {
    const malformedProvider = makeProvider(async () => jsonResponse([[1, '100']]));
    await expect(
      malformedProvider.getCandles({ symbol: 'BTCUSDT', timeframe: '1h' }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });

    const invalidPriceProvider = makeProvider(async () =>
      jsonResponse([
        [
          Date.parse('2026-10-13T13:00:00.000Z'),
          'NaN',
          '110',
          '90',
          '105',
          '12.5',
          Date.parse('2026-10-13T13:59:59.999Z'),
        ],
      ]),
    );
    await expect(
      invalidPriceProvider.getCandles({ symbol: 'BTCUSDT', timeframe: '1h' }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });

    const inconsistentProvider = makeProvider(async () =>
      jsonResponse([
        rawCandle('2026-10-13T13:00:00.000Z', '2026-10-13T13:59:59.999Z', '120'),
      ]),
    );
    await expect(
      inconsistentProvider.getCandles({ symbol: 'BTCUSDT', timeframe: '1h' }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('fails closed when latest candles are stale or absent', async () => {
    const staleProvider = makeProvider(async () =>
      jsonResponse([
        rawCandle('2026-10-13T11:00:00.000Z', '2026-10-13T11:59:59.999Z'),
      ]),
    );

    await expect(
      staleProvider.getLatestCandles({ symbol: 'BTCUSDT', timeframe: '1h' }),
    ).rejects.toBeInstanceOf(MarketDataStaleError);

    const emptyProvider = makeProvider(async () => jsonResponse([]));
    await expect(
      emptyProvider.getLatestCandles({ symbol: 'BTCUSDT', timeframe: '1h' }),
    ).rejects.toBeInstanceOf(InvalidMarketDataError);
  });

  it('marks fresh latest candles with their source and close timestamp', async () => {
    const provider = makeProvider(async () =>
      jsonResponse([
        rawCandle('2026-10-13T13:00:00.000Z', '2026-10-13T13:59:59.999Z'),
      ]),
    );

    const snapshot = await provider.getLatestCandles({
      symbol: 'BTCUSDT',
      timeframe: '1h',
      limit: 10,
    });

    expect(snapshot.provider).toBe('binance-spot');
    expect(snapshot.symbol).toBe('BTCUSDT');
    expect(snapshot.timeframe).toBe('1h');
    expect(snapshot.freshness.status).toBe('fresh');
    expect(snapshot.freshness.maxAgeMs).toBe(90 * 60 * 1_000);
    expect(snapshot.dataAsOf).toEqual(new Date('2026-10-13T13:59:59.999Z'));
  });

  it('paginates historical candles backward and returns chronological closed records', async () => {
    const requestedEndTimes: number[] = [];
    const provider = makeProvider(async (input) => {
      const url = new URL(String(input));
      const endTime = Number(url.searchParams.get('endTime'));
      requestedEndTimes.push(endTime);
      if (endTime >= Date.parse('2026-10-13T12:00:00.000Z')) {
        return jsonResponse([
          rawCandle('2026-10-13T12:00:00.000Z', '2026-10-13T12:59:59.999Z'),
          rawCandle('2026-10-13T13:00:00.000Z', '2026-10-13T13:59:59.999Z'),
        ]);
      }
      return jsonResponse([
        rawCandle('2026-10-13T11:00:00.000Z', '2026-10-13T11:59:59.999Z'),
      ]);
    });

    const candles = await provider.getHistory({
      symbol: 'BTCUSDT',
      timeframe: '1h',
      totalCandles: 3,
      chunkSize: 2,
      delayMs: 0,
    });

    expect(candles.map((candle) => candle.openTime.toISOString())).toEqual([
      '2026-10-13T11:00:00.000Z',
      '2026-10-13T12:00:00.000Z',
      '2026-10-13T13:00:00.000Z',
    ]);
    expect(requestedEndTimes).toHaveLength(2);
    expect(requestedEndTimes[1]).toBe(Date.parse('2026-10-13T12:00:00.000Z') - 1);
  });

  it('enforces configuration and historical-query bounds', async () => {
    expect(
      () => new BinanceSpotProvider({ baseUrl: 'http://api.binance.test' }),
    ).toThrow(BinanceSpotProviderError);

    const provider = makeProvider(async () => jsonResponse([]));
    await expect(
      provider.getHistory({
        symbol: 'BTCUSDT',
        timeframe: '1h',
        totalCandles: 50_001,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_QUERY' });
  });
});

describe('market data freshness contract', () => {
  it('preserves the legacy 1.5x freshness window for supported timeframes', () => {
    expect(maxMarketDataAgeMs('1h')).toBe(90 * 60 * 1_000);
    expect(maxMarketDataAgeMs('4h')).toBe(6 * 60 * 60 * 1_000);
    expect(maxMarketDataAgeMs('1d')).toBe(36 * 60 * 60 * 1_000);
  });

  it('fails closed when the latest candle closes in the future', () => {
    const candle: MarketCandle = {
      openTime: new Date('2026-10-13T14:00:00.000Z'),
      closeTime: new Date('2026-10-13T14:01:00.000Z'),
      open: 100,
      high: 110,
      low: 90,
      close: 105,
      volume: 1,
    };
    const input = {
      timeframe: '1h' as const,
      latestCandle: candle,
      checkedAt: new Date(checkedAtMs),
    };

    expect(() => evaluateLatestCandleFreshness(input)).toThrow(InvalidMarketDataError);
    expect(() => assertLatestCandleFresh(input)).toThrow('Latest candle closes in the future');
  });
});
