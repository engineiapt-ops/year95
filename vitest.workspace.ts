import { fileURLToPath } from 'node:url';
import { defineWorkspace } from 'vitest/config';

const unitAliases = {
  '@year95/contracts': fileURLToPath(new URL('./packages/contracts/src/index.ts', import.meta.url)),
  '@year95/persistence': fileURLToPath(new URL('./packages/persistence/src/supabase-readiness.ts', import.meta.url)),
};

export default defineWorkspace([
  {
    resolve: { alias: unitAliases },
    test: {
      name: 'unit',
      include: ['tests/unit/**/*.test.ts'],
      environment: 'node',
    },
  },
  {
    resolve: { alias: { '@year95/contracts': fileURLToPath(new URL('./packages/contracts/src/index.ts', import.meta.url)) } },
    test: {
      name: 'contract',
      include: ['tests/contract/**/*.test.ts', 'apps/api/tests/**/*.test.ts'],
      environment: 'node',
    },
  },
  {
    test: {
      name: 'integration',
      include: ['tests/integration/**/*.test.ts'],
      environment: 'node',
    },
  },
  {
    test: {
      name: 'e2e',
      include: ['tests/e2e/**/*.test.ts'],
      environment: 'node',
    },
  },
]);
