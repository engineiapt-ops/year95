import type {
  CandleRepository,
  Clock,
  MarketDataTimeframe,
  PriceProvider,
} from '@year95/contracts';
import { normalizeCandles } from '@year95/market-data';
import type { MarketDataSourceValidator } from '@year95/market-data';

export const INGESTION_TIMEFRAMES = ['1h', '4h', '1d'] as const satisfies readonly MarketDataTimeframe[];
export const DEFAULT_HISTORY_CANDLES: Readonly<Record<MarketDataTimeframe, number>> = Object.freeze({
  '1h': 5_000,
  '4h': 5_000,
  '1d': 3_000,
});

const HISTORY_CHUNK_SIZE = 1_000;
const HISTORY_DELAY_MS = 150;
const INCREMENTAL_CANDLE_LIMIT = 2;
const MAX_HISTORY_CANDLES = 50_000;

export interface MarketDataIngestionDependencies {
  readonly clock: Clock;
  readonly provider: PriceProvider;
  readonly repository: CandleRepository;
  readonly sourceValidator: MarketDataSourceValidator;
}

export interface IngestTimeframeResult {
  readonly timeframe: MarketDataTimeframe;
  readonly requestedHistoryCandles: number;
  readonly historyCandles: number;
  readonly incrementalCandles: number;
  readonly persistedCandles: number;
  readonly dataAsOf: string;
}

export interface MarketDataIngestionResult {
  readonly symbol: string;
  readonly providerId: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly timeframes: readonly IngestTimeframeResult[];
}

export interface MarketDataIngestionOptions {
  readonly symbol?: string;
  readonly timeframes?: readonly MarketDataTimeframe[];
  readonly historyCandles?: Partial<Readonly<Record<MarketDataTimeframe, number>>>;
}

function normalizeSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,20}$/.test(normalized)) {
    throw new Error('symbol must be a valid instrument symbol');
  }
  return normalized;
}

function normalizeTimeframes(
  timeframes: readonly MarketDataTimeframe[],
): MarketDataTimeframe[] {
  const selected = [...new Set(timeframes)];
  if (selected.length === 0) throw new Error('At least one timeframe is required');
  for (const timeframe of selected) {
    if (!(INGESTION_TIMEFRAMES as readonly string[]).includes(timeframe)) {
      throw new Error(`Unsupported market-data timeframe: ${String(timeframe)}`);
    }
  }
  return selected;
}

function historyCount(
  timeframe: MarketDataTimeframe,
  overrides: Partial<Readonly<Record<MarketDataTimeframe, number>>> | undefined,
): number {
  const requested = overrides?.[timeframe] ?? DEFAULT_HISTORY_CANDLES[timeframe];
  if (!Number.isSafeInteger(requested) || requested < 2 || requested > MAX_HISTORY_CANDLES) {
    throw new Error(`historyCandles for ${timeframe} must be between 2 and ${MAX_HISTORY_CANDLES}`);
  }
  return requested;
}

/**
 * Backfill plus incremental collection. The clock is read once so every timeframe
 * in one ingestion cycle uses the same market-data cutoff.
 */
export async function runMarketDataIngestion(
  options: MarketDataIngestionOptions,
  dependencies: MarketDataIngestionDependencies,
): Promise<MarketDataIngestionResult> {
  const symbol = normalizeSymbol(options.symbol ?? 'BTCUSDT');
  const timeframes = normalizeTimeframes(options.timeframes ?? INGESTION_TIMEFRAMES);
  const providerId = dependencies.provider.id.trim();
  if (!providerId) throw new Error('PriceProvider must expose a stable provider id');

  dependencies.sourceValidator.assertValidated(providerId, symbol);

  const now = dependencies.clock.now();
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) throw new Error('Clock returned an invalid timestamp');
  const startedAt = now.toISOString();
  const results: IngestTimeframeResult[] = [];

  for (const timeframe of timeframes) {
    const requestedHistoryCandles = historyCount(timeframe, options.historyCandles);
    const history = await dependencies.provider.getHistory({
      instrument: symbol,
      timeframe,
      totalCandles: requestedHistoryCandles,
      endTime: nowMs,
      chunkSize: HISTORY_CHUNK_SIZE,
      delayMs: HISTORY_DELAY_MS,
    });
    if (history.length !== requestedHistoryCandles) {
      throw new Error(
        `Incomplete ${timeframe} backfill: requested ${requestedHistoryCandles}, received ${history.length}`,
      );
    }

    const normalizedHistory = normalizeCandles(history, now, timeframe, {
      maxCandles: requestedHistoryCandles + INCREMENTAL_CANDLE_LIMIT,
    });
    if (normalizedHistory.length !== requestedHistoryCandles) {
      throw new Error(
        `Backfill contains non-closed or duplicate ${timeframe} candles: expected ${requestedHistoryCandles}, received ${normalizedHistory.length}`,
      );
    }

    const incremental = await dependencies.provider.getCandles({
      instrument: symbol,
      timeframe,
      limit: INCREMENTAL_CANDLE_LIMIT,
      endTime: nowMs,
    });
    const combined = normalizeCandles([...normalizedHistory, ...incremental], now, timeframe, {
      maxCandles: requestedHistoryCandles + INCREMENTAL_CANDLE_LIMIT,
    });
    const incrementalCandles = combined.length - normalizedHistory.length;
    const persistedCandles = await dependencies.repository.persistClosedCandles({
      symbol,
      timeframe,
      provider: providerId,
      candles: combined,
    });
    const latest = combined[combined.length - 1];
    if (!latest) throw new Error(`No closed candles available for ${timeframe}`);

    results.push({
      timeframe,
      requestedHistoryCandles,
      historyCandles: normalizedHistory.length,
      incrementalCandles,
      persistedCandles,
      dataAsOf: latest.closeTime.toISOString(),
    });
  }

  return {
    symbol,
    providerId,
    startedAt,
    completedAt: dependencies.clock.now().toISOString(),
    timeframes: results,
  };
}
