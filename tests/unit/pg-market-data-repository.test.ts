import { describe, expect, it, vi } from 'vitest';
import { MarketDataSourceRegistry } from '../../packages/market-data/src/provider-validation.js';
import { PgMarketDataRepository } from '../../packages/persistence/src/pg-market-data-repository.js';
import type { PgQueryable } from '../../packages/persistence/src/pg-pool.js';

const now = new Date('2026-10-28T12:00:00.000Z');
const validatedSources = new MarketDataSourceRegistry([
  { providerId: 'binance-spot', symbol: 'BTCUSDT', status: 'validated' },
]);
const candle = {
  openTime: new Date('2026-10-28T10:00:00.000Z'),
  closeTime: new Date('2026-10-28T10:59:59.999Z'),
  open: 100,
  high: 110,
  low: 95,
  close: 105,
  volume: 12.5,
};
function database(rows: readonly Record<string, unknown>[] = []): PgQueryable {
  return { query: vi.fn(async () => ({ rows, rowCount: rows.length })) } as unknown as PgQueryable;
}

describe('PgMarketDataRepository', () => {
  it('persists only validated closed candles using parameterized SQL', async () => {
    const db = database([{ open_time: candle.openTime }]);
    const repository = new PgMarketDataRepository(db, validatedSources, () => now);
    await expect(
      repository.persistClosedCandles({
        symbol: 'btcusdt',
        timeframe: '1h',
        provider: 'binance-spot',
        candles: [candle],
      }),
    ).resolves.toBe(1);
    const query = (db.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(query?.[0]).toContain('ON CONFLICT (ativo, timeframe, open_time)');
    expect(query?.[1]).toEqual([
      'BTCUSDT',
      '1h',
      candle.openTime.toISOString(),
      candle.closeTime.toISOString(),
      100,
      110,
      95,
      105,
      12.5,
      'binance-spot',
    ]);
  });

  it('rejects a provider conflict instead of overwriting the canonical candle', async () => {
    const db = database();
    const repository = new PgMarketDataRepository(db, validatedSources, () => now);
    await expect(
      repository.persistClosedCandles({
        symbol: 'BTCUSDT',
        timeframe: '1h',
        provider: 'binance-spot',
        candles: [candle],
      }),
    ).rejects.toThrow('Candle conflicts with an existing provider or newer close time');
    expect((db.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toContain(
      'public.market_data.data_provider = EXCLUDED.data_provider',
    );
    expect((db.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toContain(
      'RETURNING open_time',
    );
  });

  it('rejects an open candle before issuing any database query', async () => {
    const db = database();
    const repository = new PgMarketDataRepository(db, validatedSources, () => now);
    await expect(
      repository.persistClosedCandles({
        symbol: 'BTCUSDT',
        timeframe: '1h',
        provider: 'binance-spot',
        candles: [{ ...candle, closeTime: new Date('2026-10-28T12:00:01.000Z') }],
      }),
    ).rejects.toThrow('Open candles must not be persisted');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects invalid OHLC, invalid timeframes, duplicate candles, and unsupported symbols', async () => {
    const repository = new PgMarketDataRepository(database(), validatedSources, () => now);
    await expect(
      repository.persistClosedCandles({
        symbol: 'BTCUSDT',
        timeframe: '1h',
        provider: 'binance-spot',
        candles: [{ ...candle, high: 90 }],
      }),
    ).rejects.toThrow('Candle OHLC values are inconsistent');
    await expect(
      repository.persistClosedCandles({
        symbol: 'BTCUSDT',
        timeframe: '15m' as '1h',
        provider: 'binance-spot',
        candles: [candle],
      }),
    ).rejects.toThrow('Supported market-data timeframes');
    await expect(
      repository.persistClosedCandles({
        symbol: 'ETHUSDT',
        timeframe: '1h',
        provider: 'binance-spot',
        candles: [candle],
      }),
    ).rejects.toThrow('Only the verified BTCUSDT');
    await expect(
      repository.persistClosedCandles({
        symbol: 'BTCUSDT',
        timeframe: '1h',
        provider: 'binance-spot',
        candles: [candle, candle],
      }),
    ).rejects.toThrow('Duplicate candle openTime');
  });

  it('queries only rows with a known close time and returns chronological order', async () => {
    const db = database([
      {
        ativo: 'BTCUSDT',
        timeframe: '1h',
        open_time: candle.openTime,
        close_time: candle.closeTime,
        open: '100',
        high: '110',
        low: '95',
        close: '105',
        volume: '12.5',
        data_provider: 'binance-spot',
      },
    ]);
    const repository = new PgMarketDataRepository(db, validatedSources, () => now);
    const result = await repository.queryClosedCandles({
      symbol: 'BTCUSDT',
      provider: 'binance-spot',
      timeframe: '1h',
      limit: 1,
    });
    expect(result).toEqual([
      {
        symbol: 'BTCUSDT',
        timeframe: '1h',
        provider: 'binance-spot',
        ...candle,
      },
    ]);
    expect((db.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toContain(
      'close_time IS NOT NULL',
    );
    expect((db.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toContain(
      'data_provider = $3',
    );
    expect((db.query as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]).toEqual([
      'BTCUSDT',
      '1h',
      'binance-spot',
      1,
    ]);
  });

  it('bounds query limits and rejects inverted time windows', async () => {
    const repository = new PgMarketDataRepository(database(), validatedSources, () => now);
    await expect(
      repository.queryClosedCandles({
        symbol: 'BTCUSDT',
        provider: 'binance-spot',
        timeframe: '1h',
        limit: 1001,
      }),
    ).rejects.toThrow('limit must be an integer between 1 and 1000');
    await expect(
      repository.queryClosedCandles({
        symbol: 'BTCUSDT',
        provider: 'binance-spot',
        timeframe: '1h',
        startTime: new Date('2026-10-28T11:00:00.000Z'),
        endTime: new Date('2026-10-28T10:00:00.000Z'),
      }),
    ).rejects.toThrow('startTime must not be greater than endTime');
  });
});
