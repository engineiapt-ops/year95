export const VERSION = '0.1.0';

export { runMarketDataIngestion, DEFAULT_HISTORY_CANDLES, INGESTION_TIMEFRAMES } from './ingestion.js';
export type {
  IngestTimeframeResult,
  MarketDataIngestionDependencies,
  MarketDataIngestionOptions,
  MarketDataIngestionResult,
} from './ingestion.js';
