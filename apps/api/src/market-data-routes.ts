import type { FastifyInstance, FastifyReply } from 'fastify';
import type {
  CandleRepository,
  Clock,
  Instrument,
  InstrumentRepository,
  MarketDataTimeframe,
} from '@year95/contracts';
import {
  marketCandlesResponseSchema,
  marketDataQualityResponseSchema,
  marketDataTimeframeSchema,
  marketInstrumentsResponseSchema,
} from '@year95/contracts';
import {
  maxMarketDataAgeMs,
  type MarketDataSourceValidator,
} from '@year95/market-data';

const CANONICAL_PROVIDER_ID = 'binance-spot';
const SUPPORTED_SYMBOL = 'BTCUSDT';
const DEFAULT_CANDLE_LIMIT = 300;
const MAX_CANDLE_LIMIT = 1_000;

export interface MarketDataRouteDependencies {
  readonly instrumentRepository: Pick<InstrumentRepository, 'listEnabled' | 'findBySymbol'>;
  readonly candleRepository: Pick<CandleRepository, 'queryClosedCandles'>;
  readonly sourceValidator: MarketDataSourceValidator;
  readonly clock: Clock;
}

function sendRouteError(reply: FastifyReply, statusCode: 400 | 404 | 503, message: string) {
  const code = statusCode === 400 ? 'BAD_REQUEST' : statusCode === 404 ? 'NOT_FOUND' : 'SERVICE_UNAVAILABLE';
  return reply.code(statusCode).send({ error: { code, message } });
}

function isApprovedInstrument(instrument: Instrument): boolean {
  return instrument.enabled &&
    instrument.symbol.toUpperCase() === SUPPORTED_SYMBOL &&
    instrument.assetType === 'crypto_spot' &&
    instrument.venue === 'binance_spot' &&
    instrument.metadataStatus === 'verified';
}

function parseTimeframe(value: unknown): MarketDataTimeframe | undefined {
  const parsed = marketDataTimeframeSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function parseLimit(value: unknown): number | undefined {
  if (value === undefined) return DEFAULT_CANDLE_LIMIT;
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= MAX_CANDLE_LIMIT ? parsed : undefined;
}

async function findApprovedInstrument(
  symbolInput: unknown,
  dependencies: MarketDataRouteDependencies,
): Promise<Instrument | null> {
  if (typeof symbolInput !== 'string') return null;
  const symbol = symbolInput.trim().toUpperCase();
  if (symbol !== SUPPORTED_SYMBOL) return null;
  const instrument = await dependencies.instrumentRepository.findBySymbol(symbol);
  if (!instrument || !isApprovedInstrument(instrument)) return null;
  dependencies.sourceValidator.assertValidated(CANONICAL_PROVIDER_ID, symbol);
  return instrument;
}

export function registerMarketDataRoutes(
  v1: FastifyInstance,
  dependencies?: MarketDataRouteDependencies,
): void {
  v1.get('/instruments', async (_request, reply) => {
    if (!dependencies) return sendRouteError(reply, 503, 'Market-data repositories are unavailable');

    const instruments = await dependencies.instrumentRepository.listEnabled();
    const approved = instruments.filter((instrument) => {
      if (!isApprovedInstrument(instrument)) return false;
      try {
        dependencies.sourceValidator.assertValidated(CANONICAL_PROVIDER_ID, instrument.symbol);
        return true;
      } catch {
        return false;
      }
    });
    return marketInstrumentsResponseSchema.parse({
      items: approved.map((instrument) => ({
        symbol: instrument.symbol,
        displayName: instrument.displayName,
        assetType: instrument.assetType,
        venue: instrument.venue,
        baseCurrency: instrument.baseCurrency,
        quoteCurrency: instrument.quoteCurrency,
        providerId: CANONICAL_PROVIDER_ID,
        timeframes: ['1h', '4h', '1d'],
      })),
    });
  });

  v1.get('/market/:symbol/candles', async (request, reply) => {
    if (!dependencies) return sendRouteError(reply, 503, 'Market-data repositories are unavailable');
    const params = request.params as { readonly symbol?: unknown };
    const query = request.query as { readonly tf?: unknown; readonly limit?: unknown };
    const timeframe = parseTimeframe(query.tf);
    if (!timeframe) return sendRouteError(reply, 400, 'tf must be 1h, 4h or 1d');
    const limit = parseLimit(query.limit);
    if (limit === undefined) return sendRouteError(reply, 400, `limit must be an integer between 1 and ${MAX_CANDLE_LIMIT}`);

    const instrument = await findApprovedInstrument(params.symbol, dependencies);
    if (!instrument) return sendRouteError(reply, 404, 'Instrument is not enabled for validated market data');

    const candles = await dependencies.candleRepository.queryClosedCandles({
      symbol: instrument.symbol,
      provider: CANONICAL_PROVIDER_ID,
      timeframe,
      limit,
    });
    const latest = candles[candles.length - 1];
    return marketCandlesResponseSchema.parse({
      symbol: instrument.symbol,
      timeframe,
      providerId: CANONICAL_PROVIDER_ID,
      candles: candles.map((candle) => ({
        openTime: candle.openTime.toISOString(),
        closeTime: candle.closeTime.toISOString(),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      })),
      dataAsOf: latest?.closeTime.toISOString() ?? null,
    });
  });

  v1.get('/market/:symbol/quality', async (request, reply) => {
    if (!dependencies) return sendRouteError(reply, 503, 'Market-data repositories are unavailable');
    const params = request.params as { readonly symbol?: unknown };
    const query = request.query as { readonly tf?: unknown };
    const timeframe = parseTimeframe(query.tf);
    if (!timeframe) return sendRouteError(reply, 400, 'tf must be 1h, 4h or 1d');

    const instrument = await findApprovedInstrument(params.symbol, dependencies);
    if (!instrument) return sendRouteError(reply, 404, 'Instrument is not enabled for validated market data');

    const checkedAt = dependencies.clock.now();
    const checkedAtMs = checkedAt.getTime();
    if (!Number.isFinite(checkedAtMs)) {
      return sendRouteError(reply, 503, 'Market-data clock is unavailable');
    }
    const maxAgeMs = maxMarketDataAgeMs(timeframe);
    const candles = await dependencies.candleRepository.queryClosedCandles({
      symbol: instrument.symbol,
      provider: CANONICAL_PROVIDER_ID,
      timeframe,
      limit: 1,
    });
    const latest = candles[candles.length - 1];
    if (!latest) {
      return marketDataQualityResponseSchema.parse({
        symbol: instrument.symbol,
        timeframe,
        providerId: CANONICAL_PROVIDER_ID,
        status: 'no_data',
        blocked: true,
        blockReason: 'NO_CLOSED_CANDLES',
        checkedAt: checkedAt.toISOString(),
        dataAsOf: null,
        ageMs: null,
        maxAgeMs,
      });
    }

    const ageMs = checkedAtMs - latest.closeTime.getTime();
    if (!Number.isSafeInteger(ageMs) || ageMs < 0) {
      return sendRouteError(reply, 503, 'Latest closed candle has an invalid or future close time');
    }
    const stale = ageMs > maxAgeMs;
    return marketDataQualityResponseSchema.parse({
      symbol: instrument.symbol,
      timeframe,
      providerId: CANONICAL_PROVIDER_ID,
      status: stale ? 'stale' : 'fresh',
      blocked: stale,
      blockReason: stale ? 'STALE_MARKET_DATA' : null,
      checkedAt: checkedAt.toISOString(),
      dataAsOf: latest.closeTime.toISOString(),
      ageMs,
      maxAgeMs,
    });
  });
}
