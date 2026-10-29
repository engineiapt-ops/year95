import { describe, expect, it } from 'vitest';
import {
  assertFresh,
  evaluateQuality,
  InvalidMarketDataError,
  MarketDataGapError,
  MarketDataStaleError,
  normalizeCandles,
  type MarketCandle,
  type MarketTimeframe,
} from '../../packages/market-data/src/index.js';

const now = new Date('2026-09-26T14:00:00.000Z');

function candle(openTime: string, offset = 0, closeTime?: string): MarketCandle {
  const open = new Date(openTime);
  return {
    openTime: open,
    closeTime: closeTime ? new Date(closeTime) : new Date(open.getTime() + 3_600_000 - 1),
    open: 100 + offset,
    high: 102 + offset,
    low: 99 + offset,
    close: 101 + offset,
    volume: 10 + offset,
  };
}

function candleEndingAt(closeTime: Date): MarketCandle {
  return {
    openTime: new Date(closeTime.getTime() - 3_600_000),
    closeTime,
    open: 100,
    high: 102,
    low: 99,
    close: 101,
    volume: 10,
  };
}

describe('normalizeCandles', () => {
  it('sorts chronologically and removes exact duplicates', () => {
    const first = candle('2026-09-26T10:00:00.000Z');
    const second = candle('2026-09-26T11:00:00.000Z', 1);

    const normalized = normalizeCandles([second, first, { ...first }], now, '1h');

    expect(normalized).toHaveLength(2);
    expect(normalized[0]?.openTime.toISOString()).toBe('2026-09-26T10:00:00.000Z');
    expect(normalized[1]?.openTime.toISOString()).toBe('2026-09-26T11:00:00.000Z');
  });

  it('rejects conflicting duplicates instead of choosing one silently', () => {
    const first = candle('2026-09-26T10:00:00.000Z');
    const conflicting = { ...first, close: 101, high: 103 };

    expect(() => normalizeCandles([first, conflicting], now, '1h')).toThrow(
      /Conflicting duplicate candle timestamp/,
    );
  });

  it('discards a candle that is still forming', () => {
    const closed = candle('2026-09-26T10:00:00.000Z');
    const forming = candle('2026-09-26T11:00:00.000Z', 0, '2026-09-26T11:59:59.999Z');

    const normalized = normalizeCandles(
      [closed, forming],
      new Date('2026-09-26T11:30:00.000Z'),
      '1h',
    );

    expect(normalized).toHaveLength(1);
    expect(
      normalized.every(
        (item) => item.closeTime.getTime() <= Date.parse('2026-09-26T11:30:00.000Z'),
      ),
    ).toBe(true);
  });

  it('fails closed when the input is empty or every candle is still forming', () => {
    expect(() => normalizeCandles([], now, '1h')).toThrow(InvalidMarketDataError);
    expect(() =>
      normalizeCandles(
        [candle('2026-09-26T13:00:00.000Z', 0, '2026-09-26T13:59:59.999Z')],
        new Date('2026-09-26T13:30:00.000Z'),
        '1h',
      ),
    ).toThrow(/at least one closed candle/);
  });

  it('rejects invalid OHLCV and timestamps', () => {
    expect(() =>
      normalizeCandles([{ ...candle('2026-09-26T10:00:00.000Z'), high: 100 }], now, '1h'),
    ).toThrow(/Invalid OHLC relationship/);
    expect(() =>
      normalizeCandles([{ ...candle('2026-09-26T10:00:00.000Z'), volume: -1 }], now, '1h'),
    ).toThrow(/Invalid volume/);
    expect(() =>
      normalizeCandles(
        [{ ...candle('2026-09-26T10:00:00.000Z'), closeTime: new Date(Number.NaN) }],
        now,
        '1h',
      ),
    ).toThrow(/Invalid candle timestamp/);
  });

  it('detects missing intervals and rejects non-standard spacing', () => {
    expect(() =>
      normalizeCandles(
        [candle('2026-09-26T10:00:00.000Z'), candle('2026-09-26T12:00:00.000Z')],
        now,
        '1h',
      ),
    ).toThrow(MarketDataGapError);

    expect(() =>
      normalizeCandles(
        [candle('2026-09-26T10:00:00.000Z'), candle('2026-09-26T10:30:00.000Z')],
        now,
        '1h',
      ),
    ).toThrow(/Unexpected candle spacing/);
  });
});

describe('evaluateQuality and assertFresh', () => {
  const cases: readonly { timeframe: MarketTimeframe; durationMs: number }[] = [
    { timeframe: '1h', durationMs: 3_600_000 },
    { timeframe: '4h', durationMs: 14_400_000 },
    { timeframe: '1d', durationMs: 86_400_000 },
  ];

  it.each(cases)(
    'preserves the 1.5x freshness boundary for $timeframe',
    ({ timeframe, durationMs }) => {
      const maxAgeMs = durationMs * 1.5;
      const boundary = new Date(now.getTime() - maxAgeMs);
      const fresh = evaluateQuality([candleEndingAt(boundary)], now, timeframe);
      const stale = evaluateQuality(
        [candleEndingAt(new Date(boundary.getTime() - 1))],
        now,
        timeframe,
      );

      expect(fresh.status).toBe('fresh');
      expect(fresh.ageMs).toBe(maxAgeMs);
      expect(fresh.maxAgeMs).toBe(maxAgeMs);
      expect(stale.status).toBe('stale');
      expect(stale.ageMs).toBe(maxAgeMs + 1);
    },
  );

  it('throws typed errors for empty, future, and stale data', () => {
    expect(() => evaluateQuality([], now, '1h')).toThrow(InvalidMarketDataError);
    expect(() =>
      evaluateQuality([candleEndingAt(new Date(now.getTime() + 1))], now, '1h'),
    ).toThrow(/future/);
    expect(() =>
      assertFresh([candleEndingAt(new Date(now.getTime() - 5_400_001))], now, '1h'),
    ).toThrow(MarketDataStaleError);
  });
});
