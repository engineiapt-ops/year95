export type AssetType = 'crypto_spot' | 'fx' | 'cfd' | 'stock' | 'etf' | 'option';

/** Opaque domain identifiers; concrete venue/provider catalogs belong outside the domain. */
export type Venue = string;
export type Provider = string;

export type ProviderMappingStatus = 'validated' | 'pending';

export interface ProviderMapping {
  readonly provider: Provider;
  readonly providerSymbol: string | null;
  readonly status: ProviderMappingStatus;
  readonly validatedAt: Date | null;
  readonly source: string;
}

export interface Instrument {
  readonly id: string;
  readonly symbol: string;
  readonly assetType: AssetType;
  readonly venue: Venue;
  readonly quoteCurrency: string;
  readonly providerMappings: readonly ProviderMapping[];
}

export type Timeframe = '1h' | '4h' | '1d';

export interface Candle {
  readonly openTime: Date;
  readonly closeTime: Date;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly closed: true;
}

/** Untrusted candle input; the domain factory rejects anything not confirmed closed. */
export interface CandleInput {
  readonly openTime: Date;
  readonly closeTime: Date;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly closed: boolean;
}

export interface Quote {
  readonly instrumentId: string;
  readonly provider: Provider;
  readonly bid: number;
  readonly ask: number;
  readonly timestamp: Date;
}

const TIMEFRAME_DURATIONS_MS: Readonly<Record<Timeframe, number>> = Object.freeze({
  '1h': 60 * 60 * 1_000,
  '4h': 4 * 60 * 60 * 1_000,
  '1d': 24 * 60 * 60 * 1_000,
});

export function isMappingValidated(mapping: ProviderMapping): boolean {
  return (
    mapping.status === 'validated' &&
    typeof mapping.provider === 'string' &&
    mapping.provider.trim().length > 0 &&
    typeof mapping.providerSymbol === 'string' &&
    mapping.providerSymbol.trim().length > 0 &&
    mapping.validatedAt instanceof Date &&
    Number.isFinite(mapping.validatedAt.getTime()) &&
    typeof mapping.source === 'string' &&
    mapping.source.trim().length > 0
  );
}

/** Only crypto spot instruments with at least one complete, validated mapping are enabled. */
export function isInstrumentEnabled(instrument: Instrument): boolean {
  return (
    instrument.assetType === 'crypto_spot' &&
    instrument.providerMappings.some(isMappingValidated)
  );
}

export function timeframeDurationMs(timeframe: Timeframe): number {
  if (!Object.prototype.hasOwnProperty.call(TIMEFRAME_DURATIONS_MS, timeframe)) {
    throw new RangeError(`Unsupported timeframe: ${String(timeframe)}`);
  }

  return TIMEFRAME_DURATIONS_MS[timeframe];
}

export function createCandle(input: CandleInput): Candle {
  if (input.closed !== true) {
    throw new Error('Only closed candles are allowed');
  }

  if (
    !(input.openTime instanceof Date) ||
    !(input.closeTime instanceof Date) ||
    !Number.isFinite(input.openTime.getTime()) ||
    !Number.isFinite(input.closeTime.getTime())
  ) {
    throw new Error('Candle timestamps must be valid dates');
  }

  if (input.closeTime.getTime() <= input.openTime.getTime()) {
    throw new Error('closeTime must be after openTime');
  }

  const ohlc = [input.open, input.high, input.low, input.close];
  if (ohlc.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error('Candle OHLC values must be finite and positive');
  }

  if (input.high < input.low) {
    throw new Error('Candle high must be greater than or equal to low');
  }

  if (
    input.high < input.open ||
    input.high < input.close ||
    input.low > input.open ||
    input.low > input.close
  ) {
    throw new Error('Candle OHLC values must fit within high and low');
  }

  if (!Number.isFinite(input.volume) || input.volume < 0) {
    throw new Error('Candle volume must be finite and non-negative');
  }

  const openTimeMs = input.openTime.getTime();
  const closeTimeMs = input.closeTime.getTime();
  const candle: Candle = {
    get openTime() {
      return new Date(openTimeMs);
    },
    get closeTime() {
      return new Date(closeTimeMs);
    },
    open: input.open,
    high: input.high,
    low: input.low,
    close: input.close,
    volume: input.volume,
    closed: true,
  };

  return Object.freeze(candle);
}
