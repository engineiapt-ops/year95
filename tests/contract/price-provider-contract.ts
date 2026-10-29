import { describe, expect, it } from 'vitest';
import type {
  HistoricalPriceQuery,
  MarketDataCandle,
  PriceProvider,
  PriceQuery,
} from '@year95/contracts';

export interface PriceProviderContractSetup {
  readonly name: string;
  readonly createProvider: () => PriceProvider;
  readonly candleQuery: PriceQuery;
  readonly historyQuery: HistoricalPriceQuery;
  readonly now: Date;
}

/** Shared behavioral contract for public, read-only price providers (Binance, IG, Saxo). */
export function definePriceProviderContract(setup: PriceProviderContractSetup): void {
  function assertClosedChronologicalCandles(
    candles: readonly MarketDataCandle[],
    limit: number,
  ): void {
    expect(candles.length).toBeGreaterThan(0);
    expect(candles.length).toBeLessThanOrEqual(limit);

    let previousOpenTime = Number.NEGATIVE_INFINITY;
    for (const candle of candles) {
      expect(candle.openTime).toBeInstanceOf(Date);
      expect(candle.closeTime).toBeInstanceOf(Date);
      expect(Number.isFinite(candle.openTime.getTime())).toBe(true);
      expect(Number.isFinite(candle.closeTime.getTime())).toBe(true);
      expect(candle.closeTime.getTime()).toBeGreaterThan(candle.openTime.getTime());
      expect(candle.closeTime.getTime()).toBeLessThanOrEqual(setup.now.getTime());
      expect(candle.openTime.getTime()).toBeGreaterThan(previousOpenTime);
      previousOpenTime = candle.openTime.getTime();

      for (const value of [candle.open, candle.high, candle.low, candle.close]) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      }
      expect(candle.high).toBeGreaterThanOrEqual(candle.low);
      expect(candle.high).toBeGreaterThanOrEqual(candle.open);
      expect(candle.high).toBeGreaterThanOrEqual(candle.close);
      expect(candle.low).toBeLessThanOrEqual(candle.open);
      expect(candle.low).toBeLessThanOrEqual(candle.close);
      expect(Number.isFinite(candle.volume)).toBe(true);
      expect(candle.volume).toBeGreaterThanOrEqual(0);
    }
  }

  describe(`${setup.name} PriceProvider contract`, () => {
    it('exposes a stable, non-empty provider id', () => {
      expect(setup.createProvider().id.trim().length).toBeGreaterThan(0);
    });

    it('returns validated closed candles in chronological order', async () => {
      const candles = await setup.createProvider().getCandles(setup.candleQuery);
      assertClosedChronologicalCandles(candles, setup.candleQuery.limit ?? 500);
    });

    it('returns bounded historical candles in chronological order', async () => {
      const candles = await setup.createProvider().getHistory(setup.historyQuery);
      assertClosedChronologicalCandles(candles, setup.historyQuery.totalCandles);
    });
  });
}
