import test from 'node:test';
import assert from 'node:assert/strict';
import { TIMEFRAMES, DEFAULT_SYMBOL } from '../packages/contracts/dist/index.js';
import { loadConfig } from '../packages/config/dist/index.js';

test('contracts expose the initial market scope', () => {
  assert.deepEqual(TIMEFRAMES, ['1h', '4h', '1d']);
  assert.equal(DEFAULT_SYMBOL, 'BTCUSDT');
});

test('configuration applies deterministic defaults', () => {
  const config = loadConfig({});
  assert.equal(config.nodeEnv, 'development');
  assert.equal(config.port, 3000);
  assert.equal(config.logLevel, 'info');
  assert.equal(config.binanceBaseUrl, 'https://api.binance.com');
});

test('configuration rejects invalid ports', () => {
  assert.throws(
    () => loadConfig({ PORT: 'not-a-port' }),
    /PORT must be an integer between 1 and 65535/,
  );
});
