import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

const requiredDirectories = [
  "apps/api",
  "apps/web",
  "apps/worker",
  "packages/contracts",
  "packages/domain",
  "packages/quant",
  "packages/risk",
  "packages/market-data",
  "packages/decision",
  "packages/paper-trading",
  "packages/ai",
  "packages/persistence",
  "packages/evaluation",
  "packages/backtest",
  "packages/research",
  "packages/portfolio",
  "packages/providers",
  "packages/config"
];

test("YEAR95 monorepo skeleton exists", () => {
  for (const directory of requiredDirectories) {
    assert.equal(existsSync(directory), true, directory);
  }
});
