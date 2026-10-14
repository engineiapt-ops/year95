import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const forbiddenIdentifiers = [
  {
    selector: "Identifier[name='sizePct']",
    message: 'Use positionNotionalPct and riskPerTradePct; sizePct is ambiguous and forbidden.',
  },
  {
    selector: 'Identifier[name=/^(placeOrder|submitOrder|sendOrder)$/]',
    message: 'Live-order submission is prohibited. YEAR95 is paper-trading only.',
  },
];

const processEnvSelector = {
  selector: "MemberExpression[object.name='process'][property.name='env']",
  message: 'Read process.env only in apps/*/src/main.ts and inject configuration elsewhere.',
};

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', 'coverage/**'],
  },
  {
    files: ['scripts/**/*.mjs', 'apps/*/scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        process: 'readonly',
        URL: 'readonly',
      },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/web/scripts/supabase-auth-smoke.mjs'],
    languageOptions: {
      globals: {
        atob: 'readonly',
        window: 'readonly',
      },
    },
  },
  {
    rules: {
      'no-restricted-syntax': ['error', ...forbiddenIdentifiers],
    },
  },
  {
    files: ['apps/**/*.{js,mjs,cjs,ts,tsx}', 'packages/**/*.{js,mjs,cjs,ts,tsx}'],
    ignores: ['apps/*/src/main.ts', 'apps/*/scripts/**/*.mjs'],
    rules: {
      'no-restricted-syntax': ['error', processEnvSelector, ...forbiddenIdentifiers],
    },
  },
);
