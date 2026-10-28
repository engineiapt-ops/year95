import { describe, expect, it } from 'vitest';
import {
  MarketDataSourceRegistry,
  assertValidatedMarketDataSnapshot,
} from '../../packages/market-data/src/provider-validation.js';

describe('MarketDataSourceRegistry', () => {
  it('accepts only an explicitly validated provider/instrument pair', () => {
    const registry = new MarketDataSourceRegistry([
      { providerId: 'binance-spot', symbol: 'BTCUSDT', status: 'validated' },
    ]);
    expect(() => registry.assertValidated('binance-spot', 'btcusdt')).not.toThrow();
    expect(() => registry.assertValidated('unknown-provider', 'BTCUSDT')).toThrow(
      'Market-data source is not validated',
    );
    expect(() => registry.assertValidated('binance-spot', 'ETHUSDT')).toThrow(
      'Market-data source is not validated',
    );
  });

  it('rejects disabled sources and duplicate approvals', () => {
    const disabled = new MarketDataSourceRegistry([
      { providerId: 'saxo-sim', symbol: 'BTCUSDT', status: 'disabled' },
    ]);
    expect(() => disabled.assertValidated('saxo-sim', 'BTCUSDT')).toThrow(
      'Market-data source is not validated',
    );
    const duplicateApprovals = () =>
      new MarketDataSourceRegistry([
        { providerId: 'binance-spot', symbol: 'BTCUSDT', status: 'validated' },
        { providerId: 'binance-spot', symbol: 'btcusdt', status: 'disabled' },
      ]);
    expect(duplicateApprovals).toThrow('Duplicate market-data approval');
  });

  it('rejects malformed approval identities and empty validation inputs', () => {
    const malformedApproval = () =>
      new MarketDataSourceRegistry([
        { providerId: ' ', symbol: 'BTCUSDT', status: 'validated' },
      ]);
    expect(malformedApproval).toThrow('valid providerId and symbol');
    const registry = new MarketDataSourceRegistry([]);
    expect(() => registry.assertValidated('', 'BTCUSDT')).toThrow(
      'Market-data provider and symbol are required',
    );
  });
});


describe('assertValidatedMarketDataSnapshot', () => {
  const validator = new MarketDataSourceRegistry([
    { providerId: 'binance-spot', symbol: 'BTCUSDT', status: 'validated' },
  ]);
  const snapshot = {
    provider: 'binance-spot',
    symbol: 'BTCUSDT',
    candles: [{
      openTime: new Date('2026-10-28T10:00:00.000Z'),
      closeTime: new Date('2026-10-28T10:59:59.999Z'),
    }],
    freshness: { status: 'fresh' as const, checkedAt: '2026-10-28T12:00:00.000Z' },
  };

  it('returns a validated snapshot only for an approved, fresh source with closed candles', () => {
    expect(assertValidatedMarketDataSnapshot(snapshot, validator)).toMatchObject(snapshot);
  });

  it('rejects unapproved sources, stale data, open candles, and empty candle sets', () => {
    expect(() => assertValidatedMarketDataSnapshot(
      { ...snapshot, provider: 'unknown-provider' }, validator,
    )).toThrow('Market-data source is not validated');
    expect(() => assertValidatedMarketDataSnapshot(
      { ...snapshot, freshness: { ...snapshot.freshness, status: 'stale' } }, validator,
    )).toThrow('Stale market data');
    expect(() => assertValidatedMarketDataSnapshot(
      { ...snapshot, candles: [{ ...snapshot.candles[0]!, closeTime: new Date('2026-10-28T12:00:01.000Z') }] },
      validator,
    )).toThrow('Open candles');
    expect(() => assertValidatedMarketDataSnapshot({ ...snapshot, candles: [] }, validator))
      .toThrow('at least one closed candle');
  });
});
