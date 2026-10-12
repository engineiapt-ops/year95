import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, type ConfigEnv } from '@year95/config';
import { PgAllowlistRepository, PgHealthRepository, createPgPool } from '@year95/persistence';
import { createApiApp } from './app.js';

export async function startApi(env: ConfigEnv): Promise<void> {
  const config = loadConfig('api', env);
  const pool = config.DATABASE_URL
    ? createPgPool({
        connectionString: config.DATABASE_URL.reveal(),
        nodeEnv: config.NODE_ENV,
        ...(config.DATABASE_CA_CERT_PEM ? { caCertPem: config.DATABASE_CA_CERT_PEM } : {}),
      })
    : undefined;
  const app = createApiApp({
    config,
    ...(pool
      ? {
          dependencies: {
            healthRepository: new PgHealthRepository(pool),
            allowlistRepository: new PgAllowlistRepository(pool),
          },
        }
      : {}),
  });

  if (pool) {
    app.addHook('onClose', async () => {
      await pool.end();
    });
  }

  await app.listen({ host: '0.0.0.0', port: config.PORT });
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  void startApi({ ...process.env }).catch(() => {
    process.stderr.write('YEAR95 API startup failed. Check runtime configuration.\n');
    process.exitCode = 1;
  });
}
