CREATE TABLE IF NOT EXISTS decision_log (
  id BIGSERIAL PRIMARY KEY,
  backtest_run_id BIGINT REFERENCES backtest_runs(id) ON DELETE SET NULL,
  ativo TEXT NOT NULL,
  timeframe TEXT NOT NULL CHECK (timeframe IN ('1h', '4h', '1d')),
  decision_at TIMESTAMPTZ NOT NULL,
  data_as_of TIMESTAMPTZ NOT NULL,
  origem TEXT NOT NULL CHECK (origem IN ('jev', 'baseline')),
  recomendacao TEXT NOT NULL CHECK (recomendacao IN ('BUY', 'WAIT', 'SELL')),
  jev_model_version TEXT,
  jev_choice TEXT,
  jev_probs JSONB,
  confidence NUMERIC,
  quality_score NUMERIC,
  risco_elevado BOOLEAN,
  tamanho_posicao_pct NUMERIC NOT NULL,
  observacao TEXT,
  reference_price NUMERIC NOT NULL,
  target_pct NUMERIC,
  stop_pct NUMERIC,
  lookahead_candles INT,
  execution_model_version TEXT,
  outcome_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (outcome_status IN ('pending', 'settled', 'not_applicable')),
  outcome_direction TEXT
    CHECK (outcome_direction IN ('up', 'down', 'flat')),
  forward_return_percent NUMERIC,
  trade_profit_percent NUMERIC,
  exit_reason TEXT
    CHECK (exit_reason IN ('target', 'stop', 'end')),
  evaluated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_decision_log_run ON decision_log(backtest_run_id);
CREATE INDEX IF NOT EXISTS idx_decision_log_time ON decision_log(ativo, timeframe, decision_at);
CREATE INDEX IF NOT EXISTS idx_decision_log_outcome ON decision_log(outcome_status);

CREATE TABLE IF NOT EXISTS benchmark_runs (
  id BIGSERIAL PRIMARY KEY,
  source_run_id BIGINT REFERENCES backtest_runs(id) ON DELETE SET NULL,
  ativo TEXT NOT NULL,
  timeframe TEXT NOT NULL CHECK (timeframe IN ('1h', '4h', '1d')),
  periodo_inicio TIMESTAMPTZ NOT NULL,
  periodo_fim TIMESTAMPTZ NOT NULL,
  oos_start_ratio NUMERIC,
  candles_total INT,
  dataset_hash TEXT,
  execution_model_version TEXT,
  target_pct NUMERIC,
  stop_pct NUMERIC,
  lookahead_candles INT,
  slippage_pct NUMERIC,
  fee_pct NUMERIC,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS benchmark_results (
  id BIGSERIAL PRIMARY KEY,
  benchmark_run_id BIGINT NOT NULL REFERENCES benchmark_runs(id) ON DELETE CASCADE,
  estrategia TEXT NOT NULL CHECK (estrategia IN ('baseline', 'buyhold', 'jev')),
  status TEXT NOT NULL CHECK (status IN ('ok', 'unavailable', 'error')),
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
  UNIQUE (benchmark_run_id, estrategia)
);

CREATE INDEX IF NOT EXISTS idx_benchmark_results_run ON benchmark_results(benchmark_run_id);
