import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, type ConfigEnv } from '@year95/config';
import { systemClock } from '@year95/contracts';
import { MarketDataSourceRegistry } from '@year95/market-data';
import { createPgPool, PgMarketDataRepository } from '@year95/persistence';
import { BinancePriceProvider } from '@year95/providers';
import {
  INGESTION_TIMEFRAMES,
  runMarketDataIngestion,
  type MarketDataIngestionOptions,
} from './ingestion.js';

function readOption(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

function positiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 2 || parsed > 50_000) {
    throw new Error(`${name} must be an integer between 2 and 50000`);
  }
  return parsed;
}

export function parseIngestArguments(args: readonly string[]): MarketDataIngestionOptions {
  if (args[0] !== 'ingest') {
    throw new Error(
      'Usage: year95-worker ingest [--symbol BTCUSDT] [--timeframe 1h|4h|1d] [--candles N]',
    );
  }

  const symbol = readOption(args, '--symbol') ?? 'BTCUSDT';
  const timeframeValue = readOption(args, '--timeframe');
  const timeframes =
    timeframeValue === undefined
      ? INGESTION_TIMEFRAMES
      : [timeframeValue as (typeof INGESTION_TIMEFRAMES)[number]];
  if (
    timeframes.some((timeframe) => !(INGESTION_TIMEFRAMES as readonly string[]).includes(timeframe))
  ) {
    throw new Error('timeframe must be 1h, 4h or 1d');
  }

  const overrides: Partial<Record<(typeof INGESTION_TIMEFRAMES)[number], number>> = {};
  const commonCount = readOption(args, '--candles');
  for (const timeframe of timeframes) {
    const specific = readOption(args, `--candles-${timeframe}`);
    const count = specific ?? commonCount;
    if (count !== undefined)
      overrides[timeframe] = positiveInteger(count, `--candles${specific ? `-${timeframe}` : ''}`);
  }
  return {
    symbol,
    timeframes,
    historyCandles: overrides,
  };
}

export async function runWorkerCommand(args: readonly string[], env: ConfigEnv): Promise<void> {
  const options = parseIngestArguments(args);
  const config = loadConfig('worker', env);
  if (!config.DATABASE_URL) throw new Error('DATABASE_URL is required for market-data ingestion');

  const pool = createPgPool({
    connectionString: config.DATABASE_URL.reveal(),
    nodeEnv: config.NODE_ENV,
    sslMode: config.NODE_ENV === 'test' ? 'disable' : 'verify-full',
    ...(config.DATABASE_CA_CERT_PEM ? { caCertPem: config.DATABASE_CA_CERT_PEM } : {}),
  });
  try {
    const sourceValidator = new MarketDataSourceRegistry([
      { providerId: 'binance-spot', symbol: 'BTCUSDT', status: 'validated' },
    ]);
    const result = await runMarketDataIngestion(options, {
      clock: systemClock,
      provider: new BinancePriceProvider({ baseUrl: config.BINANCE_BASE_URL }),
      repository: new PgMarketDataRepository(pool, sourceValidator, () => systemClock.now()),
      sourceValidator,
    });
    process.stdout.write(`${JSON.stringify({ status: 'ok', ...result }, null, 2)}\n`);
  } finally {
    await pool.end();
  }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  void runWorkerCommand(process.argv.slice(2), { ...process.env }).catch(() => {
    process.stderr.write(
      'YEAR95 worker ingestion failed. Check runtime configuration and market-data provider health.\n',
    );
    process.exitCode = 1;
  });
}
