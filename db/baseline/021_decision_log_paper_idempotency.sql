CREATE UNIQUE INDEX IF NOT EXISTS idx_decision_log_paper_idempotency
  ON decision_log (ativo, timeframe, data_as_of, origem)
  WHERE backtest_run_id IS NULL;
