import {
  assertLatestCandleFresh,
  InvalidMarketDataError,
  MARKET_TIMEFRAMES,
  type CandleQuery,
  type HistoricalCandlesQuery,
  type LatestCandlesQuery,
  type MarketCandle,
  type MarketDataProvider,
  type MarketDataSnapshot,
  type MarketTimeframe,
} from '@year95/market-data';

export const SUPPORTED_BINANCE_SPOT_SYMBOLS = ['BTCUSDT'] as const;
const DEFAULT_LIMIT = 500;
const MAX_KLINES_PER_REQUEST = 1_000;
const MAX_HISTORY_CANDLES = 50_000;
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 100;
const DEFAULT_RETRY_MAX_DELAY_MS = 2_000;
const MAX_ALLOWED_RETRIES = 5;

export type BinanceSpotErrorCode =
  | 'INVALID_CONFIGURATION'
  | 'INVALID_QUERY'
  | 'UNSUPPORTED_SYMBOL'
  | 'UNSUPPORTED_TIMEFRAME'
  | 'REQUEST_FAILED'
  | 'HTTP_ERROR'
  | 'INVALID_RESPONSE';

export class BinanceSpotProviderError extends Error {
  readonly code: BinanceSpotErrorCode;
  readonly httpStatus: number | undefined;

  constructor(code: BinanceSpotErrorCode, message: string, httpStatus?: number) {
    super(message);
    this.name = 'BinanceSpotProviderError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export interface BinanceSpotProviderOptions {
  readonly baseUrl: string;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => Date;
  readonly requestTimeoutMs?: number;
  /** Retries after the initial request; only network/timeouts and transient HTTP statuses retry. */
  readonly maxRetries?: number;
  readonly retryBaseDelayMs?: number;
  readonly retryMaxDelayMs?: number;
  /** Injectable full-jitter source in [0, 1], and sleeper for deterministic tests. */
  readonly randomImpl?: () => number;
  readonly sleepImpl?: (delayMs: number) => Promise<void>;
}

interface NormalizedQuery {
  readonly symbol: (typeof SUPPORTED_BINANCE_SPOT_SYMBOLS)[number];
  readonly timeframe: MarketTimeframe;
  readonly limit: number;
  readonly startTime: number | undefined;
  readonly endTime: number | undefined;
}

function parseBaseUrl(baseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new BinanceSpotProviderError('INVALID_CONFIGURATION', 'Binance base URL must be valid');
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.pathname !== '/' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    throw new BinanceSpotProviderError(
      'INVALID_CONFIGURATION',
      'Binance base URL must be an HTTPS origin without credentials, path, query, or fragment',
    );
  }

  return parsed.origin;
}

function normalizeSymbol(symbol: string): (typeof SUPPORTED_BINANCE_SPOT_SYMBOLS)[number] {
  const normalized = symbol.trim().toUpperCase();
  if (!SUPPORTED_BINANCE_SPOT_SYMBOLS.includes(normalized as 'BTCUSDT')) {
    throw new BinanceSpotProviderError(
      'UNSUPPORTED_SYMBOL',
      'This release supports the verified BTCUSDT Binance Spot instrument only',
    );
  }
  return normalized as 'BTCUSDT';
}

function normalizeTimeframe(timeframe: string): MarketTimeframe {
  if (!(MARKET_TIMEFRAMES as readonly string[]).includes(timeframe)) {
    throw new BinanceSpotProviderError(
      'UNSUPPORTED_TIMEFRAME',
      'Supported timeframes are 1h, 4h, and 1d',
    );
  }
  return timeframe as MarketTimeframe;
}

function parseOptionalTimestamp(value: number | undefined, fieldName: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new BinanceSpotProviderError(
      'INVALID_QUERY',
      `${fieldName} must be a non-negative integer timestamp in milliseconds`,
    );
  }
  return value;
}

function normalizeQuery(query: CandleQuery): NormalizedQuery {
  const symbol = normalizeSymbol(query.symbol);
  const timeframe = normalizeTimeframe(query.timeframe);
  const rawLimit = query.limit ?? DEFAULT_LIMIT;
  if (!Number.isFinite(rawLimit)) {
    throw new BinanceSpotProviderError('INVALID_QUERY', 'limit must be a finite number');
  }

  // Preserve the legacy Binance client behavior: clamp per-request limits to 1..1000.
  const limit = Math.max(1, Math.min(MAX_KLINES_PER_REQUEST, Math.floor(rawLimit)));
  const startTime = parseOptionalTimestamp(query.startTime, 'startTime');
  const endTime = parseOptionalTimestamp(query.endTime, 'endTime');
  if (startTime !== undefined && endTime !== undefined && startTime > endTime) {
    throw new BinanceSpotProviderError(
      'INVALID_QUERY',
      'startTime must not be greater than endTime',
    );
  }

  return { symbol, timeframe, limit, startTime, endTime };
}

function parseTimestamp(value: unknown, fieldName: string): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0 || !Number.isFinite(new Date(parsed).getTime())) {
    throw new BinanceSpotProviderError(
      'INVALID_RESPONSE',
      `Binance returned an invalid ${fieldName} timestamp`,
    );
  }
  return parsed;
}

function parsePrice(value: unknown, fieldName: string): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new BinanceSpotProviderError(
      'INVALID_RESPONSE',
      `Binance returned an invalid candle ${fieldName}`,
    );
  }
  return parsed;
}

function parseVolume(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new BinanceSpotProviderError(
      'INVALID_RESPONSE',
      'Binance returned an invalid candle volume',
    );
  }
  return parsed;
}

function parseCandle(value: unknown, nowMs: number): MarketCandle | undefined {
  if (!Array.isArray(value) || value.length < 7) {
    throw new BinanceSpotProviderError(
      'INVALID_RESPONSE',
      'Binance returned a malformed kline row',
    );
  }

  const openTimeMs = parseTimestamp(value[0], 'openTime');
  const closeTimeMs = parseTimestamp(value[6], 'closeTime');
  if (closeTimeMs <= openTimeMs) {
    throw new BinanceSpotProviderError(
      'INVALID_RESPONSE',
      'Binance returned a candle whose close precedes its open',
    );
  }

  // Klines in progress have a future close time and must never enter market data.
  if (closeTimeMs > nowMs) return undefined;

  const open = parsePrice(value[1], 'open');
  const high = parsePrice(value[2], 'high');
  const low = parsePrice(value[3], 'low');
  const close = parsePrice(value[4], 'close');
  const volume = parseVolume(value[5]);
  if (high < low || high < open || high < close || low > open || low > close) {
    throw new BinanceSpotProviderError(
      'INVALID_RESPONSE',
      'Binance returned inconsistent candle OHLC values',
    );
  }

  return {
    openTime: new Date(openTimeMs),
    closeTime: new Date(closeTimeMs),
    open,
    high,
    low,
    close,
    volume,
  };
}

function parseCandleRows(payload: unknown, now: Date): readonly MarketCandle[] {
  if (!Array.isArray(payload)) {
    throw new BinanceSpotProviderError(
      'INVALID_RESPONSE',
      'Binance returned an unexpected klines response shape',
    );
  }
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) {
    throw new InvalidMarketDataError('The injected market-data clock returned an invalid date');
  }

  const byOpenTime = new Map<number, MarketCandle>();
  for (const row of payload as unknown[]) {
    const candle = parseCandle(row, nowMs);
    if (!candle) continue;
    const key = candle.openTime.getTime();
    if (byOpenTime.has(key)) {
      throw new BinanceSpotProviderError(
        'INVALID_RESPONSE',
        'Binance returned duplicate candles for the same open time',
      );
    }
    byOpenTime.set(key, candle);
  }

  return [...byOpenTime.values()].sort(
    (left, right) => left.openTime.getTime() - right.openTime.getTime(),
  );
}

function pause(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export class BinanceSpotProvider implements MarketDataProvider {
  readonly id = 'binance-spot';

  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly requestTimeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly retryMaxDelayMs: number;
  private readonly randomImpl: () => number;
  private readonly sleepImpl: (delayMs: number) => Promise<void>;

  constructor(options: BinanceSpotProviderOptions) {
    this.baseUrl = parseBaseUrl(options.baseUrl);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
    this.retryMaxDelayMs = options.retryMaxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS;
    this.randomImpl = options.randomImpl ?? (() => Math.random());
    this.sleepImpl = options.sleepImpl ?? pause;

    if (
      !Number.isSafeInteger(this.requestTimeoutMs) ||
      this.requestTimeoutMs < 1 ||
      this.requestTimeoutMs > 60_000
    ) {
      throw new BinanceSpotProviderError(
        'INVALID_CONFIGURATION',
        'requestTimeoutMs must be an integer between 1 and 60000',
      );
    }
    if (
      !Number.isSafeInteger(this.maxRetries) ||
      this.maxRetries < 0 ||
      this.maxRetries > MAX_ALLOWED_RETRIES
    ) {
      throw new BinanceSpotProviderError(
        'INVALID_CONFIGURATION',
        `maxRetries must be an integer between 0 and ${MAX_ALLOWED_RETRIES}`,
      );
    }
    if (
      !Number.isSafeInteger(this.retryBaseDelayMs) ||
      this.retryBaseDelayMs < 1 ||
      this.retryBaseDelayMs > 60_000
    ) {
      throw new BinanceSpotProviderError(
        'INVALID_CONFIGURATION',
        'retryBaseDelayMs must be an integer between 1 and 60000',
      );
    }
    if (
      !Number.isSafeInteger(this.retryMaxDelayMs) ||
      this.retryMaxDelayMs < this.retryBaseDelayMs ||
      this.retryMaxDelayMs > 60_000
    ) {
      throw new BinanceSpotProviderError(
        'INVALID_CONFIGURATION',
        'retryMaxDelayMs must be an integer greater than or equal to retryBaseDelayMs and at most 60000',
      );
    }
  }

  private async waitBeforeRetry(attempt: number): Promise<void> {
    const exponentialDelay = Math.min(this.retryMaxDelayMs, this.retryBaseDelayMs * 2 ** attempt);
    const sample = this.randomImpl();
    if (!Number.isFinite(sample) || sample < 0 || sample > 1) {
      throw new BinanceSpotProviderError(
        'INVALID_CONFIGURATION',
        'randomImpl must return a finite value between 0 and 1',
      );
    }
    await this.sleepImpl(Math.floor(sample * exponentialDelay));
  }

  private async request(url: URL): Promise<Response> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method: 'GET',
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        });
      } catch {
        if (attempt >= this.maxRetries) {
          throw new BinanceSpotProviderError(
            'REQUEST_FAILED',
            'Binance Spot request failed or timed out',
          );
        }
        await this.waitBeforeRetry(attempt);
        continue;
      }

      if (response.ok) return response;
      if (!isRetryableHttpStatus(response.status) || attempt >= this.maxRetries) {
        throw new BinanceSpotProviderError(
          'HTTP_ERROR',
          `Binance Spot returned HTTP ${response.status}`,
          response.status,
        );
      }

      await this.waitBeforeRetry(attempt);
    }

    throw new BinanceSpotProviderError(
      'REQUEST_FAILED',
      'Binance Spot request failed after retries',
    );
  }

  async getCandles(query: CandleQuery): Promise<readonly MarketCandle[]> {
    const normalized = normalizeQuery(query);
    const url = new URL('/api/v3/klines', this.baseUrl);
    url.searchParams.set('symbol', normalized.symbol);
    url.searchParams.set('interval', normalized.timeframe);
    url.searchParams.set('limit', String(normalized.limit));
    if (normalized.startTime !== undefined) {
      url.searchParams.set('startTime', String(normalized.startTime));
    }
    if (normalized.endTime !== undefined) {
      url.searchParams.set('endTime', String(normalized.endTime));
    }

    const response = await this.request(url);

    let payload: unknown;
    try {
      payload = (await response.json()) as unknown;
    } catch {
      throw new BinanceSpotProviderError('INVALID_RESPONSE', 'Binance Spot returned invalid JSON');
    }

    return parseCandleRows(payload, this.now());
  }

  async getLatestCandles(query: LatestCandlesQuery): Promise<MarketDataSnapshot> {
    const symbol = normalizeSymbol(query.symbol);
    const timeframe = normalizeTimeframe(query.timeframe);
    const candles = await this.getCandles({ ...query, symbol, timeframe });
    const latestCandle = candles[candles.length - 1];
    if (!latestCandle) {
      throw new InvalidMarketDataError('Binance Spot returned no closed candles');
    }

    const checkedAt = this.now();
    const freshness = assertLatestCandleFresh({ timeframe, latestCandle, checkedAt });
    return {
      provider: this.id,
      symbol,
      timeframe,
      candles,
      freshness,
      dataAsOf: latestCandle.closeTime,
    };
  }

  async getHistory(query: HistoricalCandlesQuery): Promise<readonly MarketCandle[]> {
    if (
      !Number.isSafeInteger(query.totalCandles) ||
      query.totalCandles < 1 ||
      query.totalCandles > MAX_HISTORY_CANDLES
    ) {
      throw new BinanceSpotProviderError(
        'INVALID_QUERY',
        'totalCandles must be an integer between 1 and 50000',
      );
    }

    const rawChunkSize = query.chunkSize ?? MAX_KLINES_PER_REQUEST;
    if (!Number.isFinite(rawChunkSize)) {
      throw new BinanceSpotProviderError('INVALID_QUERY', 'chunkSize must be a finite number');
    }
    const chunkSize = Math.max(1, Math.min(MAX_KLINES_PER_REQUEST, Math.floor(rawChunkSize)));
    const delayMs = query.delayMs ?? 100;
    if (!Number.isSafeInteger(delayMs) || delayMs < 0 || delayMs > 60_000) {
      throw new BinanceSpotProviderError(
        'INVALID_QUERY',
        'delayMs must be an integer between 0 and 60000',
      );
    }

    const symbol = normalizeSymbol(query.symbol);
    const timeframe = normalizeTimeframe(query.timeframe);
    let cursorEnd = query.endTime ?? this.now().getTime();
    if (!Number.isSafeInteger(cursorEnd) || cursorEnd < 0) {
      throw new BinanceSpotProviderError(
        'INVALID_QUERY',
        'endTime must be a non-negative integer timestamp in milliseconds',
      );
    }

    const collected = new Map<number, MarketCandle>();
    while (collected.size < query.totalCandles) {
      const remaining = query.totalCandles - collected.size;
      const batch = await this.getCandles({
        symbol,
        timeframe,
        limit: Math.min(chunkSize, remaining),
        endTime: cursorEnd,
      });
      if (batch.length === 0) break;

      const oldestOpenTime = batch[0]?.openTime.getTime();
      if (oldestOpenTime === undefined) break;
      for (const candle of batch) {
        collected.set(candle.openTime.getTime(), candle);
      }

      const nextEnd = oldestOpenTime - 1;
      if (nextEnd >= cursorEnd) break;
      cursorEnd = nextEnd;

      if (collected.size < query.totalCandles && delayMs > 0) {
        await this.sleepImpl(delayMs);
      }
    }

    return [...collected.values()]
      .sort((left, right) => left.openTime.getTime() - right.openTime.getTime())
      .slice(-query.totalCandles);
  }
}
