import type {
  HistoricalPriceQuery,
  MarketDataCandle,
  PriceProvider,
  PriceQuery,
} from '@year95/contracts';
import { BinanceSpotProvider, type BinanceSpotProviderOptions } from './binance-spot.js';

/** Options are supplied by the application boundary, including BINANCE_BASE_URL from loadConfig. */
export type BinancePriceProviderOptions = BinanceSpotProviderOptions;

/**
 * Adapts the existing Binance Spot REST client to the provider-neutral PriceProvider port.
 * The public data contract uses "instrument"; the adapter resolves that value only to the
 * currently approved BTCUSDT provider symbol.
 */
export class BinancePriceProvider implements PriceProvider {
  readonly id = 'binance-spot';

  private readonly adapter: BinanceSpotProvider;

  constructor(options: BinancePriceProviderOptions) {
    this.adapter = new BinanceSpotProvider(options);
  }

  async getCandles(query: PriceQuery): Promise<readonly MarketDataCandle[]> {
    return this.adapter.getCandles({
      symbol: query.instrument,
      timeframe: query.timeframe,
      ...(query.limit === undefined ? {} : { limit: query.limit }),
      ...(query.startTime === undefined ? {} : { startTime: query.startTime }),
      ...(query.endTime === undefined ? {} : { endTime: query.endTime }),
    });
  }

  async getHistory(query: HistoricalPriceQuery): Promise<readonly MarketDataCandle[]> {
    return this.adapter.getHistory({
      symbol: query.instrument,
      timeframe: query.timeframe,
      totalCandles: query.totalCandles,
      ...(query.endTime === undefined ? {} : { endTime: query.endTime }),
      ...(query.chunkSize === undefined ? {} : { chunkSize: query.chunkSize }),
      ...(query.delayMs === undefined ? {} : { delayMs: query.delayMs }),
    });
  }
}
