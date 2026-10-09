-- Restore the canonical paper-decision idempotency guarantee for recognized legacy databases.
-- The canonical baseline already contains this index, so this migration is idempotent
-- on a fresh database bootstrapped from db/baseline/schema.sql.
CREATE UNIQUE INDEX IF NOT EXISTS idx_decision_log_paper_idempotency
  ON decision_log (ativo, timeframe, data_as_of, origem)
  WHERE backtest_run_id IS NULL;
