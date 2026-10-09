ALTER TABLE backtest_runs
  ADD COLUMN IF NOT EXISTS calibration_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS validation_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS evaluation_policy_version TEXT;

CREATE INDEX IF NOT EXISTS idx_backtest_runs_oos_validation
  ON backtest_runs(mode, ativo, timeframe, validation_start);
