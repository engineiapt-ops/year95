# YEAR95 — Behavior Contracts

Source of truth for legacy evidence: `engineiapt-ops/ai-financial-analyst` at commit `e539b1583276c40b6793986d947134e82921ca74`.

Each contract below names the real legacy implementation source and a real legacy test reference. Where coverage is indirect, that limitation is stated explicitly.

| # | Contract | Legacy implementation evidence | Legacy test reference |
|---|---|---|---|
| 1 | **R:R >= 2** — a decision passes only when reward/risk >= 2. | `src/quant/riskReward.ts`: `MIN_RISK_REWARD = 2`; `assessRiskReward()` and `assertMinimumRiskReward()`. | `src/quant/riskReward.test.ts`: 0.02/0.01 passes; 0.019/0.01 fails; ratio 2 is asserted. |
| 2 | **Risk <= 1%** — requested risk is capped at 1% and the default policy is 0.5%. | `src/risk/riskEngine.ts`: `MAX_RISK_PER_TRADE_HARD_CAP_PCT = 1`; `DEFAULT_RISK_POLICY.maxRiskPerTradePct = 0.5`. `src/quant/positionSizing.ts`: hard cap at 1%. | `src/risk/riskEngine.test.ts`: verifies 0.5% default and rejects policy >1%. `src/quant/positionSizing.test.ts`: requested 3% is capped at 1%. |
| 3 | **Stale > 1.5x timeframe** — data is stale when age exceeds 1.5 times the timeframe duration. | `src/marketdata/quality.ts`: `maxMarketDataAgeMs(timeframe) = timeframeDurationMs(timeframe) * 1.5`. | `src/marketdata/quality.test.ts`: verifies fresh boundary behavior and a stale daily candle; stale assertion raises `MARKET_DATA_STALE`. |
| 4 | **Only closed candles** — partial candles are not eligible for trading/evaluation. | `src/marketdata/quality.ts`, `src/marketdata/collector.ts`; the collector filters with `isClosedCandle`. | `src/marketdata/quality.test.ts`: candle quality is based on close time and requires a closed-candle input. `src/product/paperTradingE2E.test.ts`: decision evaluation is explicitly against future closed candles. |
| 5 | **Idempotency** — paper decision identity is `(asset,timeframe,data_as_of,origin)`. | `db/migrations/021_decision_log_paper_idempotency.sql`: unique partial index on `(ativo, timeframe, data_as_of, origem)` for paper rows; `db/schema.sql` preserves it. | `src/db/repository.test.ts`: asserts the migration unique index and repository `ON CONFLICT` contract. |
| 6 | **Thresholds frozen in OOS** — OOS evaluation cannot start without frozen thresholds. | `src/config/thresholds.ts`: `freezeThresholds()`, `assertFrozenForOOS()`; `src/backtest/run.ts` freezes thresholds for OOS. | `src/decision/decisionEngine.test.ts`: freezes thresholds and asserts frozen state/timestamp. |
| 7 | **Audit tables append-only/immutable** — audit records reject UPDATE/DELETE at the database boundary. | `db/migrations/013_oos_validation_gate_audit.sql` and `016_outcome_settlement_audits.sql` define mutation-rejecting triggers. Related immutable snapshot triggers also exist in migrations 010, 015 and 017. | `src/evaluation/outcomeSettlementAudit.test.ts` and `src/product/paperTradingE2E.test.ts` validate immutable audit artifacts and evidence hashes. **Limitation:** no dedicated legacy integration test that directly issues SQL UPDATE/DELETE against the trigger was found. |
| 8 | **Revoke anon/authenticated** — application tables, sequences and functions are not directly exposed to Supabase `anon`/`authenticated` roles. | `db/migrations/019_revoke_public_data_api_grants.sql` revokes table/sequence/function privileges and future defaults; `020_revoke_public_function_execute.sql` revokes function EXECUTE and defaults. | `src/api/auth.test.ts` validates the authenticated application boundary for protected routes. **Limitation:** no dedicated legacy integration test that directly inspects PostgreSQL role privileges was found. |

## Contract notes

The new YEAR95 domain names are normative even where legacy persistence names differ. In particular, legacy `tamanho_posicao_pct` is not a permitted new-domain name; YEAR95 uses `positionNotionalPct`.

These contracts are behavior references, not permission to import legacy implementation code. Later rebuild PRs must preserve the contracts unless a behavior change is explicitly declared and approved.
