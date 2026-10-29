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

const MARKET_TIMEFRAME_DURATION_MS: Readonly<Record<MarketTimeframe, number>> = Object.freeze({
  '1h': 60 * 60 * 1_000,
  '4h': 4 * 60 * 60 * 1_000,
  '1d': 24 * 60 * 60 * 1_000,
});

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
  if (!Object.prototype.hasOwnProperty.call(MARKET_TIMEFRAME_DURATION_MS, timeframe)) {
    throw new InvalidMarketDataError(`Unsupported market-data timeframe: ${String(timeframe)}`);
  }
  return MARKET_TIMEFRAME_DURATION_MS[timeframe] * 1.5;
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

export class MarketDataGapError extends Error {
  readonly code = 'MARKET_DATA_GAP' as const;

  constructor(message: string) {
    super(message);
    this.name = 'MarketDataGapError';
  }
}

/**
 * Sorts closed candles, removes exact duplicates, and rejects conflicting rows
 * or gaps. The supplied time is deliberately explicit so callers can use an
 * injected Clock and tests remain deterministic.
 */
export function normalizeCandles(
  candles: readonly MarketCandle[],
  now: Date,
  timeframe: MarketTimeframe,
  options: { readonly maxCandles?: number } = {},
): MarketCandle[] {
  if (!Array.isArray(candles) || candles.length === 0) {
    throw new InvalidMarketDataError('Market data requires at least one candle');
  }

  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) {
    throw new InvalidMarketDataError('Market-data normalization time is invalid');
  }
  if (!(MARKET_TIMEFRAMES as readonly string[]).includes(timeframe)) {
    throw new InvalidMarketDataError(`Unsupported market-data timeframe: ${String(timeframe)}`);
  }

  const intervalMs = MARKET_TIMEFRAME_DURATION_MS[timeframe];
  const maxCandles = options.maxCandles ?? 1_200;
  if (!Number.isSafeInteger(maxCandles) || maxCandles <= 0) {
    throw new InvalidMarketDataError('maxCandles must be a positive integer');
  }
  if (candles.length > maxCandles) {
    throw new InvalidMarketDataError(
      `Market data exceeds maxCandles: ${candles.length} > ${maxCandles}`,
    );
  }

  const normalized: MarketCandle[] = [];
  for (const [index, candle] of candles.entries()) {
    if (
      !(candle.openTime instanceof Date) ||
      !Number.isFinite(candle.openTime.getTime()) ||
      !(candle.closeTime instanceof Date) ||
      !Number.isFinite(candle.closeTime.getTime())
    ) {
      throw new InvalidMarketDataError(`Invalid candle timestamp at candle ${index}`);
    }

    const openTimeMs = candle.openTime.getTime();
    const closeTimeMs = candle.closeTime.getTime();
    if (closeTimeMs <= openTimeMs) {
      throw new InvalidMarketDataError(`closeTime must be after openTime at candle ${index}`);
    }
    if (closeTimeMs - openTimeMs > intervalMs) {
      throw new InvalidMarketDataError(
        `Candle duration exceeds timeframe ${timeframe} at candle ${index}`,
      );
    }

    // A candle whose close is still in the future is forming and cannot be used.
    if (closeTimeMs > nowMs) continue;

    const positiveValues = [candle.open, candle.high, candle.low, candle.close];
    if (positiveValues.some((value) => !Number.isFinite(value) || value <= 0)) {
      throw new InvalidMarketDataError(`Invalid OHLC value at candle ${index}`);
    }
    if (!Number.isFinite(candle.volume) || candle.volume < 0) {
      throw new InvalidMarketDataError(`Invalid volume at candle ${index}`);
    }
    if (
      candle.high < candle.low ||
      candle.high < candle.open ||
      candle.high < candle.close ||
      candle.low > candle.open ||
      candle.low > candle.close
    ) {
      throw new InvalidMarketDataError(`Invalid OHLC relationship at candle ${index}`);
    }

    normalized.push({
      openTime: new Date(openTimeMs),
      closeTime: new Date(closeTimeMs),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
    });
  }

  if (normalized.length === 0) {
    throw new InvalidMarketDataError('Market data requires at least one closed candle');
  }

  normalized.sort((left, right) => left.openTime.getTime() - right.openTime.getTime());

  const deduplicated: MarketCandle[] = [];
  for (const candle of normalized) {
    const previous = deduplicated[deduplicated.length - 1];
    if (!previous || previous.openTime.getTime() !== candle.openTime.getTime()) {
      deduplicated.push(candle);
      continue;
    }

    const identical =
      previous.closeTime.getTime() === candle.closeTime.getTime() &&
      previous.open === candle.open &&
      previous.high === candle.high &&
      previous.low === candle.low &&
      previous.close === candle.close &&
      previous.volume === candle.volume;
    if (!identical) {
      throw new InvalidMarketDataError(
        `Conflicting duplicate candle timestamp: ${candle.openTime.toISOString()}`,
      );
    }
  }

  for (let index = 1; index < deduplicated.length; index += 1) {
    const previous = deduplicated[index - 1];
    const current = deduplicated[index];
    if (!previous || !current) {
      throw new InvalidMarketDataError('Market data contains an invalid candle sequence');
    }

    const interval = current.openTime.getTime() - previous.openTime.getTime();
    if (interval > intervalMs) {
      throw new MarketDataGapError(
        `Market-data gap detected between ${previous.openTime.toISOString()} and ${current.openTime.toISOString()}`,
      );
    }
    if (interval < intervalMs) {
      throw new InvalidMarketDataError(
        `Unexpected candle spacing between ${previous.openTime.toISOString()} and ${current.openTime.toISOString()}`,
      );
    }
  }

  return deduplicated;
}

/** Evaluates quality against an explicit timestamp; no wall-clock access occurs here. */
export function evaluateQuality(
  candles: readonly MarketCandle[],
  now: Date,
  timeframe: MarketTimeframe,
): MarketDataFreshness {
  if (!Array.isArray(candles) || candles.length === 0) {
    throw new InvalidMarketDataError('Market data quality requires at least one closed candle');
  }

  const latestCandle = candles[candles.length - 1];
  if (!latestCandle) {
    throw new InvalidMarketDataError('Market data quality requires at least one closed candle');
  }

  return evaluateLatestCandleFreshness({
    timeframe,
    latestCandle,
    checkedAt: now,
  });
}

/** Rejects stale data with a typed error so downstream decisions fail closed. */
export function assertFresh(
  candles: readonly MarketCandle[],
  now: Date,
  timeframe: MarketTimeframe,
): MarketDataFreshness {
  const freshness = evaluateQuality(candles, now, timeframe);
  if (freshness.status === 'stale') {
    throw new MarketDataStaleError(freshness);
  }
  return freshness;
}

export {
  MarketDataSourceRegistry,
  assertValidatedMarketDataSnapshot,
} from './provider-validation.js';
export type {
  MarketDataSourceApproval,
  MarketDataSourceValidator,
  MarketDataSnapshotCandidate,
  ValidatedMarketDataSnapshot,
} from './provider-validation.js';
