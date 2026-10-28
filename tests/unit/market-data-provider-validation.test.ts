import { describe, expect, it } from 'vitest';
import { MarketDataSourceRegistry } from '../../packages/market-data/src/provider-validation.js';

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
    expect(() => new MarketDataSourceRegistry([
      { providerId: 'binance-spot', symbol: 'BTCUSDT', status: 'validated' },
      { providerId: 'binance-spot', symbol: 'btcusdt', status: 'disabled' },
    ])).toThrow('Duplicate market-data approval');
  });

  it('rejects malformed approval identities and empty validation inputs', () => {
    expect(() => new MarketDataSourceRegistry([
      { providerId: ' ', symbol: 'BTCUSDT', status: 'validated' },
    ])).toThrow('valid providerId and symbol');
    const registry = new MarketDataSourceRegistry([]);
    expect(() => registry.assertValidated('', 'BTCUSDT')).toThrow(
      'Market-data provider and symbol are required',
    );
  });
});
