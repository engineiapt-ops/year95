import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  ConfigValidationError,
  Secret,
  loadConfig,
  redactConfig,
  serializeConfig,
} from '../../packages/config/src/index.js';

describe('config', () => {
  it('aggregates invalid fields and enforces the hard risk ceiling', () => {
    try {
      loadConfig('api', {
        NODE_ENV: 'invalid',
        PORT: 'not-a-port',
        BINANCE_BASE_URL: 'not-a-url',
        POSITION_NOTIONAL_BASE_PCT: '101',
        RISK_PER_TRADE_PCT_DEFAULT: '1.1',
        RISK_PER_TRADE_PCT_MAX: '1.1',
        RATE_LIMIT_MAX: '0',
        CORS_ORIGINS: 'not-a-url',
        SUPABASE_JWKS_CACHE_MAX_AGE_MS: '0',
      });
      throw new Error('expected configuration validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      const issues = (error as ConfigValidationError).issues;
      expect(issues.map((issue) => issue.path[0])).toEqual(
        expect.arrayContaining([
          'NODE_ENV',
          'PORT',
          'BINANCE_BASE_URL',
          'POSITION_NOTIONAL_BASE_PCT',
          'RISK_PER_TRADE_PCT_DEFAULT',
          'RISK_PER_TRADE_PCT_MAX',
          'RATE_LIMIT_MAX',
          'CORS_ORIGINS',
          'SUPABASE_JWKS_CACHE_MAX_AGE_MS',
        ]),
      );
      expect(issues.length).toBeGreaterThanOrEqual(8);
    }
  });

  it('applies deterministic defaults and parses CORS origins', () => {
    const config = loadConfig('api', {
      CORS_ORIGINS: 'https://year95.example, http://localhost:5173',
      DATABASE_URL: '',
      SUPABASE_JWKS_URL: '',
    });
    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(3000);
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.BINANCE_BASE_URL).toBe('https://api.binance.com');
    expect(config.POSITION_NOTIONAL_BASE_PCT).toBe(1.5);
    expect(config.RISK_PER_TRADE_PCT_DEFAULT).toBe(0.5);
    expect(config.RISK_PER_TRADE_PCT_MAX).toBe(1);
    expect(config.RATE_LIMIT_MAX).toBe(120);
    expect(config.RATE_LIMIT_HEAVY_MAX).toBe(20);
    expect(config.CORS_ORIGINS).toEqual(['https://year95.example', 'http://localhost:5173']);
    expect(config.DATABASE_URL).toBeUndefined();
    expect(config.SUPABASE_JWKS_URL).toBeUndefined();
    expect('SUPABASE_SECRET_KEY' in config).toBe(false);
  });

  it('requires explicit reveal and never serializes Secret contents', () => {
    const config = loadConfig('api', {
      DATABASE_URL: 'postgresql://private-user:db-secret@localhost/year95',
      GEMINI_API_KEY: 'gemini-secret',
    });
    const databaseUrl = config.DATABASE_URL;
    const geminiKey = config.GEMINI_API_KEY;
    expect(databaseUrl).toBeInstanceOf(Secret);
    expect(databaseUrl?.reveal()).toBe('postgresql://private-user:db-secret@localhost/year95');
    expect(geminiKey?.reveal()).toBe('gemini-secret');
    for (const serialized of [
      JSON.stringify(config),
      String(databaseUrl),
      String(geminiKey),
      inspect(databaseUrl),
      inspect(geminiKey),
      serializeConfig(config),
      JSON.stringify(redactConfig(config)),
    ]) {
      expect(serialized).not.toContain('db-secret');
      expect(serialized).not.toContain('private-user');
      expect(serialized).not.toContain('gemini-secret');
    }
    expect(JSON.stringify(config)).toContain('[REDACTED]');
    expect(String(databaseUrl)).toBe('[REDACTED]');
    expect(inspect(geminiKey)).toBe('[REDACTED]');
  });
});
