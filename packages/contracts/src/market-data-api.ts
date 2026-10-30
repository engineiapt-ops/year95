import { z } from 'zod';

export const marketDataTimeframeSchema = z.enum(['1h', '4h', '1d']);
export type MarketDataApiTimeframe = z.infer<typeof marketDataTimeframeSchema>;

export const marketDataInstrumentSchema = z.object({
  symbol: z.string().min(1),
  displayName: z.string().min(1),
  assetType: z.enum(['crypto_spot', 'cfd']),
  venue: z.string().min(1),
  baseCurrency: z.string().min(1),
  quoteCurrency: z.string().min(1),
  providerId: z.string().min(1),
  timeframes: z.array(marketDataTimeframeSchema).nonempty(),
});
export type MarketDataInstrumentResponse = z.infer<typeof marketDataInstrumentSchema>;

export const marketInstrumentsResponseSchema = z.object({
  items: z.array(marketDataInstrumentSchema),
});
export type MarketInstrumentsResponse = z.infer<typeof marketInstrumentsResponseSchema>;

export const marketDataCandleSchema = z.object({
  openTime: z.string().datetime({ offset: true }),
  closeTime: z.string().datetime({ offset: true }),
  open: z.number().finite().positive(),
  high: z.number().finite().positive(),
  low: z.number().finite().positive(),
  close: z.number().finite().positive(),
  volume: z.number().finite().nonnegative(),
});
export type MarketDataCandleResponse = z.infer<typeof marketDataCandleSchema>;

export const marketCandlesResponseSchema = z.object({
  symbol: z.string().min(1),
  timeframe: marketDataTimeframeSchema,
  providerId: z.string().min(1),
  candles: z.array(marketDataCandleSchema),
  dataAsOf: z.string().datetime({ offset: true }).nullable(),
});
export type MarketCandlesResponse = z.infer<typeof marketCandlesResponseSchema>;

export const marketDataQualityResponseSchema = z.object({
  symbol: z.string().min(1),
  timeframe: marketDataTimeframeSchema,
  providerId: z.string().min(1),
  status: z.enum(['fresh', 'stale', 'no_data']),
  blocked: z.boolean(),
  blockReason: z.enum(['STALE_MARKET_DATA', 'NO_CLOSED_CANDLES']).nullable(),
  checkedAt: z.string().datetime({ offset: true }),
  dataAsOf: z.string().datetime({ offset: true }).nullable(),
  ageMs: z.number().int().nonnegative().nullable(),
  maxAgeMs: z.number().int().positive(),
});
export type MarketDataQualityResponse = z.infer<typeof marketDataQualityResponseSchema>;
