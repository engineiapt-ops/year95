/* global module */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-no-dependencies',
      severity: 'error',
      from: { path: '^packages/domain(/|$)' },
      to: { path: '^(apps|packages)/', pathNot: '^packages/domain(/|$)' },
    },
    {
      name: 'quant-risk-decision-only-domain-contracts',
      severity: 'error',
      from: { path: '^packages/(quant|risk|decision)(/|$)' },
      to: {
        path: '^packages/',
        pathNot: '^packages/(domain|contracts|quant|risk|decision)(/|$)',
      },
    },
    {
      name: 'transport-only-persistence-providers',
      severity: 'error',
      from: {
        path: '^(apps|packages)/',
        pathNot: '^(packages/(persistence|providers)(/|$)|apps/[^/]+/tests(/|$))',
      },
      to: { path: '^(node:(http|https)|http|https|pg|@supabase/|axios|undici)(/|$)' },
    },
    {
      name: 'apps-do-not-import-apps',
      severity: 'error',
      from: { path: '^apps/([^/]+)/' },
      to: { path: '^apps/', pathNot: '^apps/$1/' },
    },
    {
      name: 'no-vercel-imports',
      severity: 'error',
      from: {},
      to: { path: '^@vercel/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    exclude: 'node_modules',
  },
};
