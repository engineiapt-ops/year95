import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BinancePriceProvider } from '../../packages/providers/src/binance-price.js';
import { BinanceSpotProviderError } from '../../packages/providers/src/binance-spot.js';
import { definePriceProviderContract } from './price-provider-contract.js';

const checkedAt = new Date('2026-10-13T14:00:00.000Z');
const baseUrl = 'https://api.binance.test';
const fixture: unknown = JSON.parse(
  readFileSync(new URL('../fixtures/binance-klines-1h.json', import.meta.url), 'utf8'),
);

function fixtureFetch(requestedUrls: string[] = []): typeof fetch {
  return async (input) => {
    requestedUrls.push(String(input));
    return new Response(JSON.stringify(fixture), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
}

function createProvider(fetchImpl: typeof fetch = fixtureFetch()): BinancePriceProvider {
  return new BinancePriceProvider({
    baseUrl,
    fetchImpl,
    now: () => new Date(checkedAt.getTime()),
    maxRetries: 0,
  });
}

definePriceProviderContract({
  name: 'BinancePriceProvider',
  createProvider: () => createProvider(),
  now: checkedAt,
  candleQuery: {
    instrument: 'BTCUSDT',
    timeframe: '1h',
    limit: 2,
  },
  historyQuery: {
    instrument: 'BTCUSDT',
    timeframe: '1h',
    totalCandles: 2,
    chunkSize: 2,
    delayMs: 0,
  },
});

describe('BinancePriceProvider REST adapter', () => {
  it.each(['1h', '4h', '1d'] as const)(
    'maps the %s interval through the configured Binance REST origin',
    async (timeframe) => {
      const requestedUrls: string[] = [];
      const provider = createProvider(fixtureFetch(requestedUrls));

      await provider.getCandles({ instrument: 'btcusdt', timeframe, limit: 2 });

      expect(requestedUrls).toHaveLength(1);
      const url = new URL(requestedUrls[0] ?? '');
      expect(url.origin).toBe(baseUrl);
      expect(url.pathname).toBe('/api/v3/klines');
      expect(url.searchParams.get('symbol')).toBe('BTCUSDT');
      expect(url.searchParams.get('interval')).toBe(timeframe);
      expect(url.searchParams.get('limit')).toBe('2');
    },
  );

  it('rejects instruments that are not explicitly supported before any HTTP request', async () => {
    const requestedUrls: string[] = [];
    const provider = createProvider(fixtureFetch(requestedUrls));

    await expect(
      provider.getCandles({ instrument: 'ETHUSDT', timeframe: '1h' }),
    ).rejects.toMatchObject<Partial<BinanceSpotProviderError>>({
      name: 'BinanceSpotProviderError',
      code: 'UNSUPPORTED_SYMBOL',
    });
    expect(requestedUrls).toHaveLength(0);
  });
});
