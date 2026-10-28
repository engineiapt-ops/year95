import type { MarketDataSourceValidator } from '@year95/market-data';
import type { PgQueryable } from './pg-pool.js';

export const PERSISTABLE_MARKET_TIMEFRAMES = ['1h', '4h', '1d'] as const;
export type PersistableMarketTimeframe = (typeof PERSISTABLE_MARKET_TIMEFRAMES)[number];

export interface ClosedMarketCandle {
  readonly openTime: Date;
  readonly closeTime: Date;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export interface PersistClosedCandlesInput {
  readonly symbol: string;
  readonly timeframe: PersistableMarketTimeframe;
  readonly provider: string;
  readonly candles: readonly ClosedMarketCandle[];
}

export interface StoredMarketCandle extends ClosedMarketCandle {
  readonly symbol: string;
  readonly timeframe: PersistableMarketTimeframe;
  readonly provider: string;
}

export interface QueryClosedCandlesInput {
  readonly symbol: string;
  readonly provider: string;
  readonly timeframe: PersistableMarketTimeframe;
  readonly limit?: number;
  readonly startTime?: Date;
  readonly endTime?: Date;
}

interface MarketCandleRow {
  readonly ativo: string;
  readonly timeframe: PersistableMarketTimeframe;
  readonly open_time: Date | string;
  readonly close_time: Date | string;
  readonly open: string | number;
  readonly high: string | number;
  readonly low: string | number;
  readonly close: string | number;
  readonly volume: string | number;
  readonly data_provider: string;
}

const MAX_QUERY_LIMIT = 1_000;

function assertSymbol(symbol: string): void {
  if (symbol.trim().toUpperCase() !== 'BTCUSDT') {
    throw new Error('Only the verified BTCUSDT instrument can be persisted in this release');
  }
}

function assertTimeframe(timeframe: string): asserts timeframe is PersistableMarketTimeframe {
  if (!(PERSISTABLE_MARKET_TIMEFRAMES as readonly string[]).includes(timeframe)) {
    throw new Error('Supported market-data timeframes are 1h, 4h, and 1d');
  }
}

function timestamp(value: Date, field: string): number {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error(field + ' must be a valid Date');
  }
  return value.getTime();
}

function validateCandle(candle: ClosedMarketCandle, nowMs: number): void {
  const openTimeMs = timestamp(candle.openTime, 'openTime');
  const closeTimeMs = timestamp(candle.closeTime, 'closeTime');
  if (closeTimeMs < openTimeMs) throw new Error('closeTime must not precede openTime');
  if (closeTimeMs > nowMs) throw new Error('Open candles must not be persisted');
  for (const [field, value] of Object.entries({
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  })) {
    if (!Number.isFinite(value) || value <= 0)
      throw new Error(field + ' must be finite and positive');
  }
  if (!Number.isFinite(candle.volume) || candle.volume < 0) {
    throw new Error('volume must be finite and non-negative');
  }
  if (
    candle.high < candle.low ||
    candle.high < candle.open ||
    candle.high < candle.close ||
    candle.low > candle.open ||
    candle.low > candle.close
  ) {
    throw new Error('Candle OHLC values are inconsistent');
  }
}

function mapStoredCandle(row: MarketCandleRow): StoredMarketCandle {
  return {
    symbol: row.ativo,
    timeframe: row.timeframe,
    provider: row.data_provider,
    openTime: new Date(row.open_time),
    closeTime: new Date(row.close_time),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
  };
}

export class PgMarketDataRepository {
  constructor(
    private readonly db: PgQueryable,
    private readonly sourceValidator: MarketDataSourceValidator,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async persistClosedCandles(input: PersistClosedCandlesInput): Promise<number> {
    assertSymbol(input.symbol);
    assertTimeframe(input.timeframe);
    const symbol = input.symbol.trim().toUpperCase();
    const provider = input.provider.trim();
    if (!provider || provider.length > 100)
      throw new Error('provider must contain 1..100 characters');
    this.sourceValidator.assertValidated(provider, symbol);
    const nowMs = timestamp(this.now(), 'clock');
    const seenOpenTimes = new Set<number>();

    for (const candle of input.candles) {
      validateCandle(candle, nowMs);
      const key = candle.openTime.getTime();
      if (seenOpenTimes.has(key)) throw new Error('Duplicate candle openTime in persistence batch');
      seenOpenTimes.add(key);
    }

    for (const candle of input.candles) {
      await this.db.query(
        `INSERT INTO public.market_data
          (ativo, timeframe, open_time, close_time, open, high, low, close, volume, data_provider)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (ativo, timeframe, open_time) DO UPDATE SET
           close_time = EXCLUDED.close_time,
           open = EXCLUDED.open,
           high = EXCLUDED.high,
           low = EXCLUDED.low,
           close = EXCLUDED.close,
           volume = EXCLUDED.volume,
           data_provider = EXCLUDED.data_provider
         WHERE public.market_data.close_time IS NULL
            OR public.market_data.close_time <= EXCLUDED.close_time`,
        [
          symbol,
          input.timeframe,
          candle.openTime.toISOString(),
          candle.closeTime.toISOString(),
          candle.open,
          candle.high,
          candle.low,
          candle.close,
          candle.volume,
          provider,
        ],
      );
    }
    return input.candles.length;
  }

  async queryClosedCandles(input: QueryClosedCandlesInput): Promise<readonly StoredMarketCandle[]> {
    assertSymbol(input.symbol);
    assertTimeframe(input.timeframe);
    const limit = input.limit ?? 500;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_QUERY_LIMIT) {
      throw new Error('limit must be an integer between 1 and 1000');
    }
    const startTime =
      input.startTime === undefined ? undefined : timestamp(input.startTime, 'startTime');
    const endTime = input.endTime === undefined ? undefined : timestamp(input.endTime, 'endTime');
    if (startTime !== undefined && endTime !== undefined && startTime > endTime) {
      throw new Error('startTime must not be greater than endTime');
    }

    const symbol = input.symbol.trim().toUpperCase();
    const provider = input.provider.trim();
    if (!provider || provider.length > 100)
      throw new Error('provider must contain 1..100 characters');
    this.sourceValidator.assertValidated(provider, symbol);
    const values: unknown[] = [symbol, input.timeframe, provider];
    const conditions = [
      'ativo = $1',
      'timeframe = $2',
      'data_provider = $3',
      'close_time IS NOT NULL',
    ];
    if (startTime !== undefined) {
      values.push(new Date(startTime).toISOString());
      conditions.push('open_time >= $' + values.length);
    }
    if (endTime !== undefined) {
      values.push(new Date(endTime).toISOString());
      conditions.push('open_time <= $' + values.length);
    }
    values.push(limit);
    const result = await this.db.query<MarketCandleRow>(
      `SELECT ativo, timeframe, open_time, close_time, open, high, low, close, volume, data_provider
       FROM public.market_data
       WHERE ${conditions.join(' AND ')}
       ORDER BY open_time DESC
       LIMIT $${values.length}`,
      values,
    );
    return result.rows.map(mapStoredCandle).reverse();
  }
}
