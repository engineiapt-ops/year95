-- Additive baseline corrections for two historical indexes omitted from schema.sql.
-- Keep schema.sql and the 23 archived historical migration files immutable.
-- Applying IF NOT EXISTS reproduces the final schema without changing existing data.
CREATE INDEX IF NOT EXISTS idx_backtest_runs_oos_validation
  ON backtest_runs (mode, ativo, timeframe, validation_start);

CREATE INDEX IF NOT EXISTS idx_wf_folds_strategy_run
  ON walk_forward_folds (walk_forward_run_id, estrategia);
