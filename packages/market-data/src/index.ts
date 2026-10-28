export const VERSION = '0.1.0';

export const MARKET_TIMEFRAMES = ['1h', '4h', '1d'] as const;
export type MarketTimeframe = (typeof MARKET_TIMEFRAMES)[number];

export interface MarketCandle {
  readonly openTime: Date;
  readonly closeTime: Date;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export interface CandleQuery {
  readonly symbol: string;
  readonly timeframe: MarketTimeframe;
  readonly limit?: number;
  readonly startTime?: number;
  readonly endTime?: number;
}

export interface LatestCandlesQuery {
  readonly symbol: string;
  readonly timeframe: MarketTimeframe;
  readonly limit?: number;
}

export interface HistoricalCandlesQuery {
  readonly symbol: string;
  readonly timeframe: MarketTimeframe;
  readonly totalCandles: number;
  readonly endTime?: number;
  readonly chunkSize?: number;
  readonly delayMs?: number;
}

export interface MarketDataFreshness {
  readonly status: 'fresh' | 'stale';
  readonly timeframe: MarketTimeframe;
  readonly checkedAt: string;
  readonly dataAsOf: string;
  readonly ageMs: number;
  readonly maxAgeMs: number;
}

export interface MarketDataSnapshot {
  readonly provider: string;
  readonly symbol: string;
  readonly timeframe: MarketTimeframe;
  readonly candles: readonly MarketCandle[];
  readonly freshness: MarketDataFreshness;
  readonly dataAsOf: Date;
}

export interface MarketDataProvider {
  readonly id: string;
  getCandles(query: CandleQuery): Promise<readonly MarketCandle[]>;
  getLatestCandles(query: LatestCandlesQuery): Promise<MarketDataSnapshot>;
  getHistory(query: HistoricalCandlesQuery): Promise<readonly MarketCandle[]>;
}

export class InvalidMarketDataError extends Error {
  readonly code = 'INVALID_MARKET_DATA' as const;

  constructor(message: string) {
    super(message);
    this.name = 'InvalidMarketDataError';
  }
}

export class MarketDataStaleError extends Error {
  readonly code = 'MARKET_DATA_STALE' as const;
  readonly freshness: MarketDataFreshness;

  constructor(freshness: MarketDataFreshness) {
    super(
      `Market data is stale for ${freshness.timeframe}: age ${freshness.ageMs}ms exceeds max ${freshness.maxAgeMs}ms`,
    );
    this.name = 'MarketDataStaleError';
    this.freshness = freshness;
  }
}

export function maxMarketDataAgeMs(timeframe: MarketTimeframe): number {
  switch (timeframe) {
    case '1h':
      return 60 * 60 * 1_000 * 1.5;
    case '4h':
      return 4 * 60 * 60 * 1_000 * 1.5;
    case '1d':
      return 24 * 60 * 60 * 1_000 * 1.5;
  }
}

export function evaluateLatestCandleFreshness(input: {
  readonly timeframe: MarketTimeframe;
  readonly latestCandle: MarketCandle;
  readonly checkedAt: Date;
}): MarketDataFreshness {
  const checkedAtMs = input.checkedAt.getTime();
  const dataAsOfMs = input.latestCandle.closeTime.getTime();

  if (!Number.isFinite(checkedAtMs)) {
    throw new InvalidMarketDataError('Market-data check time is invalid');
  }
  if (!Number.isFinite(dataAsOfMs)) {
    throw new InvalidMarketDataError('Latest candle close time is invalid');
  }

  const ageMs = checkedAtMs - dataAsOfMs;
  if (ageMs < 0) {
    throw new InvalidMarketDataError('Latest candle closes in the future');
  }

  const maxAgeMs = maxMarketDataAgeMs(input.timeframe);
  return {
    status: ageMs <= maxAgeMs ? 'fresh' : 'stale',
    timeframe: input.timeframe,
    checkedAt: input.checkedAt.toISOString(),
    dataAsOf: input.latestCandle.closeTime.toISOString(),
    ageMs,
    maxAgeMs,
  };
}

export function assertLatestCandleFresh(input: {
  readonly timeframe: MarketTimeframe;
  readonly latestCandle: MarketCandle;
  readonly checkedAt: Date;
}): MarketDataFreshness {
  const freshness = evaluateLatestCandleFreshness(input);
  if (freshness.status === 'stale') {
    throw new MarketDataStaleError(freshness);
  }
  return freshness;
}

export { MarketDataSourceRegistry } from './provider-validation.js';
export type { MarketDataSourceApproval, MarketDataSourceValidator } from './provider-validation.js';
