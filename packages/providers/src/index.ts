export const VERSION = '0.1.0';

export {
  BinanceSpotProvider,
  BinanceSpotProviderError,
  SUPPORTED_BINANCE_SPOT_SYMBOLS,
} from './binance-spot.js';
export type { BinanceSpotErrorCode, BinanceSpotProviderOptions } from './binance-spot.js';

export { BinancePriceProvider } from './binance-price.js';
export type { BinancePriceProviderOptions } from './binance-price.js';
