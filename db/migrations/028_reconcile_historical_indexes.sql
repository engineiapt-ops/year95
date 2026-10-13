-- Restore two historical indexes omitted from the canonical schema.sql snapshot.
-- IF NOT EXISTS makes this additive migration safe for both existing and fresh databases.
CREATE INDEX IF NOT EXISTS idx_backtest_runs_oos_validation
  ON backtest_runs (mode, ativo, timeframe, validation_start);

CREATE INDEX IF NOT EXISTS idx_wf_folds_strategy_run
  ON walk_forward_folds (walk_forward_run_id, estrategia);
