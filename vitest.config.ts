import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { name: 'unit', include: ['tests/unit/**/*.test.ts'] },
      { name: 'contract', include: ['tests/contract/**/*.test.ts'] },
      { name: 'integration', include: ['tests/integration/**/*.test.ts'] },
      { name: 'e2e', include: ['tests/e2e/**/*.test.ts'] },
    ],
  },
});
