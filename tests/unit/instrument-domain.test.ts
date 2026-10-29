import { describe, expect, it } from 'vitest';
import {
  createCandle,
  isInstrumentEnabled,
  isMappingValidated,
  timeframeDurationMs,
} from '../../packages/domain/src/index.js';
import type {
  AssetType,
  CandleInput,
  Instrument,
  ProviderMapping,
  Timeframe,
} from '../../packages/domain/src/index.js';

const validatedMapping: ProviderMapping = {
  provider: 'market-source-a',
  providerSymbol: 'BTCUSDT',
  status: 'validated',
  validatedAt: new Date('2026-10-01T00:00:00.000Z'),
  source: 'verified instrument metadata',
};

const pendingMapping: ProviderMapping = {
  provider: 'market-source-b',
  providerSymbol: null,
  status: 'pending',
  validatedAt: null,
  source: 'awaiting instrument metadata verification',
};

function makeInstrument(
  assetType: AssetType = 'crypto_spot',
  providerMappings: readonly ProviderMapping[] = [validatedMapping],
): Instrument {
  return {
    id: 'btc-usdt',
    symbol: 'BTCUSDT',
    assetType,
    venue: 'binance_spot',
    quoteCurrency: 'USDT',
    providerMappings,
  };
}

const validCandleInput: CandleInput = {
  openTime: new Date('2026-10-28T10:00:00.000Z'),
  closeTime: new Date('2026-10-28T10:59:59.999Z'),
  open: 100,
  high: 110,
  low: 95,
  close: 105,
  volume: 12.5,
  closed: true,
};

describe('instrument domain', () => {
  it('keeps BTCUSDT provider-neutral while preserving the legacy classification', () => {
    const instrument = makeInstrument();

    expect(instrument.symbol).toBe('BTCUSDT');
    expect(instrument.assetType).toBe('crypto_spot');
    expect(instrument.venue).toBe('binance_spot');
    expect(isInstrumentEnabled(instrument)).toBe(true);
  });

  it('enables only crypto_spot instruments with a validated mapping', () => {
    for (const assetType of ['fx', 'cfd', 'stock', 'etf', 'option'] as const) {
      expect(isInstrumentEnabled(makeInstrument(assetType))).toBe(false);
    }

    expect(isInstrumentEnabled(makeInstrument('crypto_spot', []))).toBe(false);
    expect(isInstrumentEnabled(makeInstrument('crypto_spot', [pendingMapping]))).toBe(false);
  });

  it('validates mapping provenance and does not trust the status flag alone', () => {
    expect(isMappingValidated(validatedMapping)).toBe(true);
    expect(isMappingValidated(pendingMapping)).toBe(false);
    expect(isMappingValidated({ ...validatedMapping, providerSymbol: null })).toBe(false);
    expect(isMappingValidated({ ...validatedMapping, validatedAt: null })).toBe(false);
    expect(isMappingValidated({ ...validatedMapping, source: ' ' })).toBe(false);
  });
});

describe('timeframeDurationMs', () => {
  it('returns the fixed duration for each supported timeframe', () => {
    expect(timeframeDurationMs('1h')).toBe(3_600_000);
    expect(timeframeDurationMs('4h')).toBe(14_400_000);
    expect(timeframeDurationMs('1d')).toBe(86_400_000);
  });

  it('rejects unsupported runtime values, including inherited object keys', () => {
    for (const unsupported of ['15m', 'toString', 'constructor'] as const) {
      expect(() => timeframeDurationMs(unsupported as Timeframe)).toThrow('Unsupported timeframe');
    }
  });
});

describe('createCandle', () => {
  it('creates an immutable closed candle with valid timestamps and OHLCV', () => {
    const candle = createCandle(validCandleInput);

    expect(candle).toMatchObject({
      open: 100,
      high: 110,
      low: 95,
      close: 105,
      volume: 12.5,
      closed: true,
    });
    expect(candle.closeTime.getTime()).toBeGreaterThan(candle.openTime.getTime());
    expect(Object.isFrozen(candle)).toBe(true);

    const changedOpenTime = candle.openTime;
    changedOpenTime.setTime(0);
    const changedCloseTime = candle.closeTime;
    changedCloseTime.setTime(0);

    expect(candle.openTime.toISOString()).toBe('2026-10-28T10:00:00.000Z');
    expect(candle.closeTime.toISOString()).toBe('2026-10-28T10:59:59.999Z');
  });

  it('rejects a candle that is still forming', () => {
    expect(() => createCandle({ ...validCandleInput, closed: false })).toThrow(
      'Only closed candles are allowed',
    );
  });

  it('rejects an inverted range and OHLC values outside the range', () => {
    expect(() => createCandle({ ...validCandleInput, high: 90, low: 95 })).toThrow(
      'Candle high must be greater than or equal to low',
    );
    expect(() => createCandle({ ...validCandleInput, high: 102 })).toThrow(
      'Candle OHLC values must fit within high and low',
    );
  });

  it('rejects invalid times and non-finite or invalid prices and volume', () => {
    expect(() =>
      createCandle({
        ...validCandleInput,
        closeTime: new Date('2026-10-28T10:00:00.000Z'),
      }),
    ).toThrow('closeTime must be after openTime');
    expect(() =>
      createCandle({
        ...validCandleInput,
        openTime: new Date(Number.NaN),
      }),
    ).toThrow('Candle timestamps must be valid dates');
    expect(() => createCandle({ ...validCandleInput, close: Number.NaN })).toThrow(
      'Candle OHLC values must be finite and positive',
    );
    expect(() => createCandle({ ...validCandleInput, volume: -1 })).toThrow(
      'Candle volume must be finite and non-negative',
    );
  });
});
