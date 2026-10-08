/* global module */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "domain-no-dependencies",
      severity: "error",
      from: { path: "^packages/domain(/|$)" },
      to: {
        path: "^(apps|packages)/",
        pathNot: "^packages/domain(/|$)"
      }
    },
    {
      name: "quant-only-domain-contracts",
      severity: "error",
      from: { path: "^packages/quant(/|$)" },
      to: {
        path: "^packages/",
        pathNot: "^packages/(domain|contracts)(/|$)"
      }
    },
    {
      name: "risk-only-domain-contracts",
      severity: "error",
      from: { path: "^packages/risk(/|$)" },
      to: {
        path: "^packages/",
        pathNot: "^packages/(domain|contracts)(/|$)"
      }
    },
    {
      name: "decision-only-domain-contracts",
      severity: "error",
      from: { path: "^packages/decision(/|$)" },
      to: {
        path: "^packages/",
        pathNot: "^packages/(domain|contracts)(/|$)"
      }
    },
    {
      name: "transport-only-persistence-providers",
      severity: "error",
      from: {
        path: "^(apps|packages)/",
        pathNot: "^(packages/(persistence|providers)(/|$))"
      },
      to: {
        path: "^(node:(http|https)|http|https|pg|@supabase/|axios|undici)(/|$)"
      }
    },
    {
      name: "apps-do-not-import-apps",
      severity: "error",
      from: { path: "^apps/([^/]+)(/|$)" },
      to: { path: "^apps/" }
    },
    {
      name: "no-vercel-imports",
      severity: "error",
      from: {},
      to: { path: "^@vercel/" }
    }
  ],
  options: {
    doNotFollow: {
      path: "node_modules"
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.base.json"
    },
    exclude: "node_modules"
  }
};
