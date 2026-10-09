CREATE TABLE IF NOT EXISTS walk_forward_runs (
  id BIGSERIAL PRIMARY KEY,
  ativo TEXT NOT NULL,
  timeframe TEXT NOT NULL CHECK (timeframe IN ('1h', '4h', '1d')),
  dataset_start TIMESTAMPTZ NOT NULL,
  dataset_end TIMESTAMPTZ NOT NULL,
  candles_total INT NOT NULL,
  dataset_hash TEXT NOT NULL,
  initial_train_candles INT NOT NULL,
  test_candles INT NOT NULL,
  step_candles INT NOT NULL,
  lookahead_candles INT NOT NULL,
  execution_model_version TEXT NOT NULL,
  target_pct NUMERIC NOT NULL,
  stop_pct NUMERIC NOT NULL,
  slippage_pct NUMERIC NOT NULL,
  fee_pct NUMERIC NOT NULL,
  threshold_frozen_at TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS walk_forward_folds (
  id BIGSERIAL PRIMARY KEY,
  walk_forward_run_id BIGINT NOT NULL REFERENCES walk_forward_runs(id) ON DELETE CASCADE,
  fold_number INT NOT NULL,
  train_start TIMESTAMPTZ NOT NULL,
  train_end TIMESTAMPTZ NOT NULL,
  test_start TIMESTAMPTZ NOT NULL,
  test_end TIMESTAMPTZ NOT NULL,
  estrategia TEXT NOT NULL CHECK (estrategia IN ('baseline', 'buyhold', 'jev')),
  status TEXT NOT NULL CHECK (status IN ('ok', 'unavailable', 'error')),
  test_signals INT NOT NULL DEFAULT 0,
  total_trades INT NOT NULL DEFAULT 0,
  closed_trades INT NOT NULL DEFAULT 0,
  open_trades INT NOT NULL DEFAULT 0,
  win_rate NUMERIC,
  profit_factor NUMERIC,
  total_profit_percent NUMERIC NOT NULL DEFAULT 0,
  avg_profit_percent NUMERIC NOT NULL DEFAULT 0,
  expectancy_percent NUMERIC NOT NULL DEFAULT 0,
  max_drawdown_percent NUMERIC NOT NULL DEFAULT 0,
  gross_total_profit_percent NUMERIC NOT NULL DEFAULT 0,
  total_fee_percent NUMERIC NOT NULL DEFAULT 0,
  total_slippage_percent NUMERIC NOT NULL DEFAULT 0,
  avg_candles_held NUMERIC,
  notas TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (walk_forward_run_id, fold_number, estrategia)
);

CREATE INDEX IF NOT EXISTS idx_wf_folds_run ON walk_forward_folds(walk_forward_run_id);
CREATE INDEX IF NOT EXISTS idx_wf_folds_strategy ON walk_forward_folds(estrategia);
