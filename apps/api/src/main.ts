import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { loadConfig, type ConfigEnv } from '@year95/config';
import { systemClock } from '@year95/contracts';
import { MarketDataSourceRegistry } from '@year95/market-data';
import {
  PgAllowlistRepository,
  PgHealthRepository,
  PgInstrumentRepository,
  PgMarketDataRepository,
  createPgPool,
} from '@year95/persistence';
import { buildApp } from './app.js';
import { registerMarketDataRoutes } from './market-data-routes.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

export async function startApi(env: ConfigEnv): Promise<void> {
  const config = loadConfig('api', env);
  const pool = config.DATABASE_URL
    ? createPgPool({
        connectionString: config.DATABASE_URL.reveal(),
        nodeEnv: config.NODE_ENV,
        sslMode: config.NODE_ENV === 'test' ? 'disable' : 'verify-full',
        ...(config.DATABASE_CA_CERT_PEM ? { caCertPem: config.DATABASE_CA_CERT_PEM } : {}),
      })
    : undefined;
  const sourceValidator = new MarketDataSourceRegistry([
    { providerId: 'binance-spot', symbol: 'BTCUSDT', status: 'validated' },
  ]);
  const app = buildApp({
    config,
    ...(pool
      ? {
          dependencies: {
            healthRepository: new PgHealthRepository(pool),
            allowlistRepository: new PgAllowlistRepository(pool),
          },
        }
      : {}),
    registerV1Routes(v1) {
      registerMarketDataRoutes(
        v1,
        pool
          ? {
              instrumentRepository: new PgInstrumentRepository(pool),
              candleRepository: new PgMarketDataRepository(pool, sourceValidator, () =>
                systemClock.now(),
              ),
              sourceValidator,
              clock: systemClock,
            }
          : undefined,
      );
    },
  });

  if (pool) {
    app.addHook('onClose', async () => {
      await pool.end();
    });
  }

  await app.listen({ host: '0.0.0.0', port: config.PORT });
  installGracefulShutdown(app);
}

function installGracefulShutdown(app: FastifyInstance): void {
  let shutdownPromise: Promise<void> | undefined;

  const shutdown = (signal: NodeJS.Signals): void => {
    if (shutdownPromise) return;

    app.log.info({ signal }, 'API graceful shutdown started');
    const timeout = setTimeout(() => {
      app.log.fatal({ signal, timeoutMs: SHUTDOWN_TIMEOUT_MS }, 'API graceful shutdown timed out');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    timeout.unref();

    shutdownPromise = app
      .close()
      .then(() => {
        app.log.info({ signal }, 'API graceful shutdown completed');
      })
      .catch(() => {
        app.log.error({ signal }, 'API graceful shutdown failed');
        process.exitCode = 1;
      })
      .finally(() => {
        clearTimeout(timeout);
      });
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  void startApi({ ...process.env }).catch(() => {
    process.stderr.write('YEAR95 API startup failed. Check runtime configuration.\n');
    process.exitCode = 1;
  });
}
