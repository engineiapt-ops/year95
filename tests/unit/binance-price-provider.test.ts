import { describe, expect, it } from 'vitest';
import { MarketDataSourceRegistry } from '@year95/market-data';
import { BinancePriceProvider } from '../../packages/providers/src/binance-price.js';

describe('BinancePriceProvider', () => {
  it('uses the validated persistence provider identifier', () => {
    const provider = new BinancePriceProvider({ baseUrl: 'https://api.binance.test' });
    const registry = new MarketDataSourceRegistry([
      { providerId: 'binance-spot', symbol: 'BTCUSDT', status: 'validated' },
    ]);

    expect(provider.id).toBe('binance-spot');
    expect(() => registry.assertValidated(provider.id, 'BTCUSDT')).not.toThrow();
  });
});
