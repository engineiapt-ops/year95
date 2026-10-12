import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const requiredDirectories = [
  'apps/api',
  'apps/web',
  'apps/worker',
  'packages/contracts',
  'packages/domain',
  'packages/quant',
  'packages/risk',
  'packages/market-data',
  'packages/decision',
  'packages/paper-trading',
  'packages/ai',
  'packages/persistence',
  'packages/evaluation',
  'packages/backtest',
  'packages/research',
  'packages/portfolio',
  'packages/providers',
  'packages/config',
  'db/migrations',
  'docs/adr',
];

const failures = [];

for (const directory of requiredDirectories) {
  if (!existsSync(join(process.cwd(), directory))) {
    failures.push('Missing required directory: ' + directory);
  }
}

const domainPackage = join(process.cwd(), 'packages/domain/package.json');
if (existsSync(domainPackage)) {
  const packageJson = JSON.parse(readFileSync(domainPackage, 'utf8'));
  const dependencies = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
  };
  for (const dependency of ['pg', 'postgres', 'axios', 'node-fetch', 'fastify', 'express']) {
    if (dependency in dependencies) {
      failures.push('Domain must not depend on infrastructure package: ' + dependency);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('YEAR95 foundation checks passed.');
