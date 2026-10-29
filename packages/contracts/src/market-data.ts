export type MarketDataTimeframe = '1h' | '4h' | '1d';

export interface MarketDataCandle {
  readonly openTime: Date;
  readonly closeTime: Date;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export interface PriceQuery {
  readonly instrument: string;
  readonly timeframe: MarketDataTimeframe;
  readonly limit?: number;
  readonly startTime?: number;
  readonly endTime?: number;
}

export interface HistoricalPriceQuery {
  readonly instrument: string;
  readonly timeframe: MarketDataTimeframe;
  readonly totalCandles: number;
  readonly endTime?: number;
  readonly chunkSize?: number;
  readonly delayMs?: number;
}

/** Provider-neutral port. Implementations must return candle records, not provider payloads. */
export interface PriceProvider {
  readonly id: string;
  getCandles(query: PriceQuery): Promise<readonly MarketDataCandle[]>;
  getHistory(query: HistoricalPriceQuery): Promise<readonly MarketDataCandle[]>;
}

export interface PersistClosedCandlesInput {
  readonly symbol: string;
  readonly timeframe: MarketDataTimeframe;
  readonly provider: string;
  readonly candles: readonly MarketDataCandle[];
}

export interface QueryClosedCandlesInput {
  readonly symbol: string;
  readonly provider: string;
  readonly timeframe: MarketDataTimeframe;
  readonly limit?: number;
  readonly startTime?: Date;
  readonly endTime?: Date;
}

export interface StoredMarketCandle extends MarketDataCandle {
  readonly symbol: string;
  readonly timeframe: MarketDataTimeframe;
  readonly provider: string;
}

/** Storage port; concrete PostgreSQL details remain in packages/persistence. */
export interface CandleRepository {
  persistClosedCandles(input: PersistClosedCandlesInput): Promise<number>;
  queryClosedCandles(input: QueryClosedCandlesInput): Promise<readonly StoredMarketCandle[]>;
}

export interface ProvenanceRecord {
  readonly provider: string;
  readonly fetchedAt: Date;
  readonly requestId: string;
}
