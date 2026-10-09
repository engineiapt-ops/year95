ALTER TABLE backtest_runs
  ADD COLUMN IF NOT EXISTS execution_model_version TEXT,
  ADD COLUMN IF NOT EXISTS target_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS stop_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS lookahead_candles INT,
  ADD COLUMN IF NOT EXISTS slippage_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS fee_pct NUMERIC;

ALTER TABLE paper_trades
  ADD COLUMN IF NOT EXISTS execution_model_version TEXT,
  ADD COLUMN IF NOT EXISTS gross_profit_percent NUMERIC,
  ADD COLUMN IF NOT EXISTS fee_percent NUMERIC,
  ADD COLUMN IF NOT EXISTS slippage_percent NUMERIC,
  ADD COLUMN IF NOT EXISTS candles_held INT,
  ADD COLUMN IF NOT EXISTS exit_reason TEXT CHECK (exit_reason IN ('target', 'stop', 'end')),
  ADD COLUMN IF NOT EXISTS max_favorable_excursion_percent NUMERIC,
  ADD COLUMN IF NOT EXISTS max_adverse_excursion_percent NUMERIC;
