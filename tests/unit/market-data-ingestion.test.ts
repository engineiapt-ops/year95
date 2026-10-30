import { describe, expect, it, vi } from 'vitest';
import type {
  CandleRepository,
  Clock,
  MarketDataCandle,
  PriceProvider,
  StoredMarketCandle,
} from '@year95/contracts';
import type { MarketDataSourceValidator } from '@year95/market-data';
import { runMarketDataIngestion } from '../../apps/worker/src/ingestion.js';

const now = new Date('2026-10-30T04:00:00.000Z');
const c1: MarketDataCandle = {
  openTime: new Date('2026-10-30T01:00:00.000Z'),
  closeTime: new Date('2026-10-30T01:59:59.999Z'),
  open: 100, high: 102, low: 99, close: 101, volume: 10,
};
const c2: MarketDataCandle = {
  openTime: new Date('2026-10-30T02:00:00.000Z'),
  closeTime: new Date('2026-10-30T02:59:59.999Z'),
  open: 101, high: 103, low: 100, close: 102, volume: 12,
};
const c3: MarketDataCandle = {
  openTime: new Date('2026-10-30T03:00:00.000Z'),
  closeTime: new Date('2026-10-30T03:59:59.999Z'),
  open: 102, high: 104, low: 101, close: 103, volume: 15,
};

function memoryRepository(): CandleRepository & { readonly records: Map<string, StoredMarketCandle> } {
  const records = new Map<string, StoredMarketCandle>();
  return {
    records,
    async persistClosedCandles(input) {
      for (const candle of input.candles) {
        const key = `${input.symbol}:${input.timeframe}:${candle.openTime.toISOString()}`;
        records.set(key, { ...candle, symbol: input.symbol, timeframe: input.timeframe, provider: input.provider });
      }
      return input.candles.length;
    },
    async queryClosedCandles(input) {
      return [...records.values()]
        .filter((candle) => candle.symbol === input.symbol &&
          candle.provider === input.provider &&
          candle.timeframe === input.timeframe)
        .sort((left, right) => left.openTime.getTime() - right.openTime.getTime())
        .slice(-(input.limit ?? 500));
    },
  };
}

describe('runMarketDataIngestion', () => {
  it('backfills, adds the latest closed candle and remains idempotent on repeated runs', async () => {
    const repository = memoryRepository();
    const getHistory = vi.fn(async () => [c1, c2]);
    const getCandles = vi.fn(async () => [c2, c3]);
    const provider: PriceProvider = {
      id: 'binance-spot',
      getHistory,
      getCandles,
    };
    const clock: Clock = { now: () => new Date(now) };
    const sourceValidator: MarketDataSourceValidator = {
      assertValidated: (providerId, symbol) => {
        if (providerId !== 'binance-spot' || symbol !== 'BTCUSDT') throw new Error('source not validated');
      },
    };
    const dependencies = { clock, provider, repository, sourceValidator };
    const options = { symbol: 'btcusdt', timeframes: ['1h'] as const, historyCandles: { '1h': 2 } };

    const first = await runMarketDataIngestion(options, dependencies);
    expect(first.timeframes[0]).toMatchObject({
      timeframe: '1h',
      requestedHistoryCandles: 2,
      historyCandles: 2,
      incrementalCandles: 1,
      persistedCandles: 3,
      dataAsOf: c3.closeTime.toISOString(),
    });
    expect(repository.records).toHaveLength(3);

    const second = await runMarketDataIngestion(options, dependencies);
    expect(second.timeframes[0]?.persistedCandles).toBe(3);
    expect(repository.records.size).toBe(3);
    expect(getHistory).toHaveBeenCalledTimes(2);
    expect(getCandles).toHaveBeenCalledTimes(2);
  });

  it('fails before provider access when the provider/instrument pair is not validated', async () => {
    const getHistory = vi.fn(async () => [c1, c2]);
    const provider: PriceProvider = {
      id: 'unapproved-provider',
      getHistory,
      getCandles: async () => [],
    };
    const sourceValidator: MarketDataSourceValidator = {
      assertValidated: () => { throw new Error('Market-data source is not validated'); },
    };
    await expect(runMarketDataIngestion(
      { timeframes: ['1h'], historyCandles: { '1h': 2 } },
      { clock: { now: () => new Date(now) }, provider, repository: memoryRepository(), sourceValidator },
    )).rejects.toThrow('Market-data source is not validated');
    expect(getHistory).not.toHaveBeenCalled();
  });

  it('rejects an incomplete backfill and does not persist partial history', async () => {
    const repository = memoryRepository();
    const provider: PriceProvider = {
      id: 'binance-spot',
      getHistory: async () => [c1],
      getCandles: async () => [c2],
    };
    const sourceValidator: MarketDataSourceValidator = { assertValidated: () => undefined };
    await expect(runMarketDataIngestion(
      { timeframes: ['1h'], historyCandles: { '1h': 2 } },
      { clock: { now: () => new Date(now) }, provider, repository, sourceValidator },
    )).rejects.toThrow('Incomplete 1h backfill');
    expect(repository.records.size).toBe(0);
  });

  it('rejects invalid history limits and duplicate timeframe selection', async () => {
    const provider: PriceProvider = {
      id: 'binance-spot',
      getHistory: async () => [c1, c2],
      getCandles: async () => [],
    };
    const sourceValidator: MarketDataSourceValidator = { assertValidated: () => undefined };
    const dependencies = { clock: { now: () => new Date(now) }, provider, repository: memoryRepository(), sourceValidator };
    await expect(runMarketDataIngestion(
      { timeframes: ['1h'], historyCandles: { '1h': 1 } },
      dependencies,
    )).rejects.toThrow('historyCandles for 1h');
    await expect(runMarketDataIngestion(
      { timeframes: [] },
      dependencies,
    )).rejects.toThrow('At least one timeframe');
  });
});
