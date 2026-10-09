CREATE TABLE IF NOT EXISTS market_data (
  id BIGSERIAL PRIMARY KEY,
  ativo TEXT NOT NULL,
  timeframe TEXT NOT NULL CHECK (timeframe IN ('1h', '4h', '1d')),
  open_time TIMESTAMPTZ NOT NULL,
  open NUMERIC NOT NULL,
  high NUMERIC NOT NULL,
  low NUMERIC NOT NULL,
  close NUMERIC NOT NULL,
  volume NUMERIC NOT NULL,
  vwap NUMERIC, ema9 NUMERIC, ema21 NUMERIC, rsi NUMERIC, atr NUMERIC,
  UNIQUE (ativo, timeframe, open_time)
);

CREATE TABLE IF NOT EXISTS backtest_runs (
  id BIGSERIAL PRIMARY KEY,
  engine TEXT NOT NULL CHECK (engine IN ('both', 'baseline', 'jev')),
  mode TEXT NOT NULL CHECK (mode IN ('dev', 'oos')),
  ativo TEXT NOT NULL,
  timeframe TEXT NOT NULL CHECK (timeframe IN ('1h', '4h', '1d')),
  periodo_inicio TIMESTAMPTZ NOT NULL,
  periodo_fim TIMESTAMPTZ NOT NULL,
  oos_start_ratio NUMERIC,
  calibration_end TIMESTAMPTZ,
  validation_start TIMESTAMPTZ,
  evaluation_policy_version TEXT,
  thresholds_congelados_em TIMESTAMPTZ,
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

CREATE TABLE IF NOT EXISTS signals (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  backtest_run_id BIGINT REFERENCES backtest_runs(id) ON DELETE SET NULL,
  ativo TEXT NOT NULL,
  timeframe TEXT NOT NULL CHECK (timeframe IN ('1h', '4h', '1d')),
  entrada NUMERIC,
  stop NUMERIC,
  alvo NUMERIC,
  origem TEXT NOT NULL CHECK (origem IN ('jev', 'baseline')),
  jev_choice TEXT,
  jev_probs JSONB,
  jev_model_version TEXT,
  quality_score NUMERIC,
  risco_elevado BOOLEAN,
  recomendacao TEXT NOT NULL CHECK (recomendacao IN ('BUY', 'WAIT', 'SELL')),
  tamanho_posicao_pct NUMERIC NOT NULL CHECK (tamanho_posicao_pct >= 0 AND tamanho_posicao_pct <= 100),
  observacao TEXT
);

CREATE TABLE IF NOT EXISTS paper_trades (
  id BIGSERIAL PRIMARY KEY,
  signal_id BIGINT NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  entry_price NUMERIC NOT NULL,
  exit_price NUMERIC,
  outcome TEXT NOT NULL CHECK (outcome IN ('win', 'loss', 'open')),
  profit_percent NUMERIC NOT NULL,
  gross_profit_percent NUMERIC,
  fee_percent NUMERIC,
  slippage_percent NUMERIC,
  candles_held INT,
  execution_model_version TEXT,
  exit_reason TEXT CHECK (exit_reason IN ('target', 'stop', 'end')),
  max_favorable_excursion_percent NUMERIC,
  max_adverse_excursion_percent NUMERIC,
  drawdown NUMERIC,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS config (
  user_id TEXT PRIMARY KEY,
  ativo_pref TEXT NOT NULL DEFAULT 'BTCUSDT',
  valor_invest NUMERIC NOT NULL DEFAULT 100,
  horizon_default TEXT NOT NULL DEFAULT '1h' CHECK (horizon_default IN ('1h', '4h', '1d')),
  fixed_position_pct NUMERIC NOT NULL DEFAULT 2.0 CHECK (fixed_position_pct >= 0 AND fixed_position_pct <= 100),
  thresholds_congelados_em TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS logs (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  componente TEXT NOT NULL,
  nivel TEXT NOT NULL CHECK (nivel IN ('info', 'warn', 'error')),
  mensagem TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_backtest_runs_created ON backtest_runs(criado_em);
CREATE INDEX IF NOT EXISTS idx_signals_backtest_run ON signals(backtest_run_id);
CREATE INDEX IF NOT EXISTS idx_signals_origem ON signals(origem);
CREATE INDEX IF NOT EXISTS idx_signals_ts ON signals(ts);
CREATE INDEX IF NOT EXISTS idx_signals_ativo_tf ON signals(ativo, timeframe);
CREATE INDEX IF NOT EXISTS idx_market_data_lookup ON market_data(ativo, timeframe, open_time);
CREATE INDEX IF NOT EXISTS idx_paper_trades_signal_id ON paper_trades(signal_id);
CREATE INDEX IF NOT EXISTS idx_paper_trades_outcome ON paper_trades(outcome);
CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts);


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
  outcome_direction TEXT CHECK (outcome_direction IN ('up', 'down', 'flat')),
  forward_return_percent NUMERIC,
  trade_profit_percent NUMERIC,
  exit_reason TEXT CHECK (exit_reason IN ('target', 'stop', 'end')),
  evaluated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_decision_log_run ON decision_log(backtest_run_id);
CREATE INDEX IF NOT EXISTS idx_decision_log_time ON decision_log(ativo, timeframe, decision_at);
CREATE INDEX IF NOT EXISTS idx_decision_log_outcome ON decision_log(outcome_status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_decision_log_paper_idempotency
  ON decision_log (ativo, timeframe, data_as_of, origem)
  WHERE backtest_run_id IS NULL;


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
  estrategia TEXT NOT NULL CHECK (estrategia IN ('baseline', 'baseline_risk', 'buyhold', 'jev')),
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
  estrategia TEXT NOT NULL CHECK (estrategia IN ('baseline', 'baseline_risk', 'buyhold', 'jev')),
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


CREATE TABLE IF NOT EXISTS portfolio_runs (
  id BIGSERIAL PRIMARY KEY,
  source_backtest_run_id BIGINT NOT NULL REFERENCES backtest_runs(id) ON DELETE CASCADE,
  ativo TEXT NOT NULL,
  timeframe TEXT NOT NULL CHECK (timeframe IN ('1h', '4h', '1d')),
  initial_capital NUMERIC NOT NULL,
  final_equity NUMERIC NOT NULL,
  position_size_pct NUMERIC NOT NULL,
  max_gross_exposure_pct NUMERIC NOT NULL,
  portfolio_model_version TEXT NOT NULL,
  dataset_hash TEXT NOT NULL,
  total_return_pct NUMERIC NOT NULL,
  cagr_pct NUMERIC,
  max_drawdown_pct NUMERIC NOT NULL,
  sharpe NUMERIC,
  sortino NUMERIC,
  total_trades INT NOT NULL DEFAULT 0,
  closed_trades INT NOT NULL DEFAULT 0,
  winning_trades INT NOT NULL DEFAULT 0,
  losing_trades INT NOT NULL DEFAULT 0,
  rejected_trades INT NOT NULL DEFAULT 0,
  total_realized_pnl NUMERIC NOT NULL DEFAULT 0,
  total_unrealized_pnl NUMERIC NOT NULL DEFAULT 0,
  total_fees NUMERIC NOT NULL DEFAULT 0,
  total_slippage NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portfolio_positions (
  id BIGSERIAL PRIMARY KEY,
  portfolio_run_id BIGINT NOT NULL REFERENCES portfolio_runs(id) ON DELETE CASCADE,
  paper_trade_id BIGINT NOT NULL REFERENCES paper_trades(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  allocated_notional NUMERIC NOT NULL,
  entry_price NUMERIC NOT NULL,
  exit_price NUMERIC,
  opened_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('closed', 'liquidated_end', 'rejected')),
  net_pnl NUMERIC NOT NULL DEFAULT 0,
  gross_pnl NUMERIC NOT NULL DEFAULT 0,
  fees NUMERIC NOT NULL DEFAULT 0,
  slippage NUMERIC NOT NULL DEFAULT 0,
  return_pct NUMERIC NOT NULL DEFAULT 0,
  rejection_reason TEXT
);

CREATE TABLE IF NOT EXISTS portfolio_equity_curve (
  id BIGSERIAL PRIMARY KEY,
  portfolio_run_id BIGINT NOT NULL REFERENCES portfolio_runs(id) ON DELETE CASCADE,
  as_of TIMESTAMPTZ NOT NULL,
  equity NUMERIC NOT NULL,
  cash NUMERIC NOT NULL,
  realized_pnl NUMERIC NOT NULL,
  unrealized_pnl NUMERIC NOT NULL,
  gross_exposure NUMERIC NOT NULL,
  open_positions INT NOT NULL,
  drawdown_pct NUMERIC NOT NULL,
  UNIQUE (portfolio_run_id, as_of)
);

CREATE INDEX IF NOT EXISTS idx_portfolio_runs_source ON portfolio_runs(source_backtest_run_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_positions_run ON portfolio_positions(portfolio_run_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_curve_run_time ON portfolio_equity_curve(portfolio_run_id, as_of);

CREATE TABLE IF NOT EXISTS oos_validation_gate_audits (
  id BIGSERIAL PRIMARY KEY,
  backtest_run_id BIGINT NOT NULL REFERENCES backtest_runs(id) ON DELETE RESTRICT,
  walk_forward_run_id BIGINT REFERENCES walk_forward_runs(id) ON DELETE RESTRICT,
  ativo TEXT NOT NULL,
  timeframe TEXT NOT NULL CHECK (timeframe IN ('1h', '4h', '1d')),
  estrategia TEXT NOT NULL CHECK (estrategia IN ('baseline', 'baseline_risk', 'jev')),
  gate_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ready', 'blocked')),
  validation_from TIMESTAMPTZ NOT NULL,
  validation_to TIMESTAMPTZ NOT NULL,
  evidence_hash TEXT NOT NULL CHECK (evidence_hash ~ '^[0-9a-f]{64}$'),
  gate JSONB NOT NULL,
  evidence JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (backtest_run_id, walk_forward_run_id, estrategia, evidence_hash)
);

CREATE INDEX IF NOT EXISTS idx_oos_gate_audit_backtest
  ON oos_validation_gate_audits(backtest_run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oos_gate_audit_scope
  ON oos_validation_gate_audits(ativo, timeframe, created_at DESC);

CREATE OR REPLACE FUNCTION reject_oos_validation_gate_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'oos_validation_gate_audits are immutable';
END;
$$;

DROP TRIGGER IF EXISTS oos_validation_gate_audits_immutable ON oos_validation_gate_audits;
CREATE TRIGGER oos_validation_gate_audits_immutable
  BEFORE UPDATE OR DELETE ON oos_validation_gate_audits
  FOR EACH ROW EXECUTE FUNCTION reject_oos_validation_gate_audit_mutation();


CREATE TABLE IF NOT EXISTS research_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  signal_id BIGINT NOT NULL REFERENCES signals(id) ON DELETE RESTRICT,
  decision_log_id BIGINT REFERENCES decision_log(id) ON DELETE SET NULL,
  ativo TEXT NOT NULL,
  timeframe TEXT NOT NULL CHECK (timeframe IN ('1h', '4h', '1d')),
  data_as_of TIMESTAMPTZ NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (signal_id)
);

CREATE INDEX IF NOT EXISTS idx_research_snapshots_signal
  ON research_snapshots(signal_id);
CREATE INDEX IF NOT EXISTS idx_research_snapshots_decision_log
  ON research_snapshots(decision_log_id);
CREATE INDEX IF NOT EXISTS idx_research_snapshots_asset_time
  ON research_snapshots(ativo, timeframe, data_as_of);

CREATE OR REPLACE FUNCTION reject_research_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'research_snapshots are immutable';
END;
$$;

DROP TRIGGER IF EXISTS research_snapshots_immutable ON research_snapshots;
CREATE TRIGGER research_snapshots_immutable
  BEFORE UPDATE OR DELETE ON research_snapshots
  FOR EACH ROW EXECUTE FUNCTION reject_research_snapshot_mutation();



CREATE TABLE IF NOT EXISTS pipeline_audit_snapshots (
  id BIGSERIAL PRIMARY KEY,
  walk_forward_run_id BIGINT NOT NULL REFERENCES walk_forward_runs(id) ON DELETE RESTRICT,
  ativo TEXT NOT NULL,
  timeframe TEXT NOT NULL CHECK (timeframe IN ('1h', '4h', '1d')),
  dataset_hash TEXT NOT NULL CHECK (dataset_hash ~ '^[0-9a-f]{64}$'),
  audit_version TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('ready', 'degraded', 'blocked')),
  operational_quality_state TEXT CHECK (operational_quality_state IN ('ready', 'degraded', 'blocked')),
  evidence_hash TEXT NOT NULL CHECK (evidence_hash ~ '^[0-9a-f]{64}$'),
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (walk_forward_run_id, evidence_hash)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_audit_snapshots_run
  ON pipeline_audit_snapshots(walk_forward_run_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_pipeline_audit_snapshots_scope
  ON pipeline_audit_snapshots(ativo, timeframe, created_at DESC);

CREATE OR REPLACE FUNCTION reject_pipeline_audit_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'pipeline_audit_snapshots are immutable';
END;
$$;

DROP TRIGGER IF EXISTS pipeline_audit_snapshots_immutable ON pipeline_audit_snapshots;
CREATE TRIGGER pipeline_audit_snapshots_immutable
  BEFORE UPDATE OR DELETE ON pipeline_audit_snapshots
  FOR EACH ROW EXECUTE FUNCTION reject_pipeline_audit_snapshot_mutation();

CREATE TABLE IF NOT EXISTS outcome_settlement_audits (
  id BIGSERIAL PRIMARY KEY,
  decision_log_id BIGINT NOT NULL UNIQUE REFERENCES decision_log(id) ON DELETE RESTRICT,
  audit_version TEXT NOT NULL,
  ativo TEXT NOT NULL,
  timeframe TEXT NOT NULL CHECK (timeframe IN ('1h', '4h', '1d')),
  recommendation TEXT NOT NULL CHECK (recommendation IN ('BUY', 'WAIT', 'SELL')),
  decision_at TIMESTAMPTZ NOT NULL,
  data_as_of TIMESTAMPTZ NOT NULL,
  evaluated_at TIMESTAMPTZ NOT NULL,
  reference_price NUMERIC NOT NULL CHECK (reference_price > 0),
  lookahead_candles INT NOT NULL CHECK (lookahead_candles > 0),
  flat_threshold_pct NUMERIC NOT NULL CHECK (flat_threshold_pct >= 0 AND flat_threshold_pct <= 100),
  outcome_status TEXT NOT NULL CHECK (outcome_status IN ('settled', 'not_applicable')),
  outcome_direction TEXT NOT NULL CHECK (outcome_direction IN ('up', 'down', 'flat')),
  forward_return_percent NUMERIC NOT NULL,
  trade_profit_percent NUMERIC,
  exit_reason TEXT NOT NULL CHECK (exit_reason IN ('target', 'stop', 'end')),
  evaluation_candle_open_time TIMESTAMPTZ NOT NULL,
  evaluation_candle_close_time TIMESTAMPTZ NOT NULL,
  evaluation_price NUMERIC NOT NULL CHECK (evaluation_price > 0),
  future_closed_candle_count INT NOT NULL CHECK (future_closed_candle_count > 0),
  future_first_open_time TIMESTAMPTZ NOT NULL,
  future_last_close_time TIMESTAMPTZ NOT NULL,
  market_data_hash TEXT NOT NULL CHECK (market_data_hash ~ '^[0-9a-f]{64}$'),
  evidence_hash TEXT NOT NULL UNIQUE CHECK (evidence_hash ~ '^[0-9a-f]{64}$'),
  source TEXT NOT NULL CHECK (source = 'persisted-market-data'),
  notes JSONB NOT NULL,
  audit JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outcome_settlement_audits_scope
  ON outcome_settlement_audits(ativo, timeframe, evaluated_at DESC);

CREATE INDEX IF NOT EXISTS idx_outcome_settlement_audits_evaluated
  ON outcome_settlement_audits(evaluated_at DESC);

CREATE OR REPLACE FUNCTION reject_outcome_settlement_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'outcome_settlement_audits are immutable';
END;
$$;

DROP TRIGGER IF EXISTS outcome_settlement_audits_immutable ON outcome_settlement_audits;
CREATE TRIGGER outcome_settlement_audits_immutable
  BEFORE UPDATE OR DELETE ON outcome_settlement_audits
  FOR EACH ROW EXECUTE FUNCTION reject_outcome_settlement_audit_mutation();

-- System validation history / evidence timeline.
CREATE TABLE IF NOT EXISTS system_validation_snapshots (
  id BIGSERIAL PRIMARY KEY,
  ativo TEXT NOT NULL,
  timeframe TEXT NOT NULL CHECK (timeframe IN ('1h', '4h', '1d')),
  from_run BIGINT,
  lookback_days INT NOT NULL CHECK (lookback_days >= 1 AND lookback_days <= 3650),
  validation_version TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('ready', 'degraded', 'blocked')),
  ready_count INT NOT NULL CHECK (ready_count >= 0),
  degraded_count INT NOT NULL CHECK (degraded_count >= 0),
  blocked_count INT NOT NULL CHECK (blocked_count >= 0),
  blocking_failures INT NOT NULL CHECK (blocking_failures >= 0),
  evidence_hash TEXT NOT NULL UNIQUE CHECK (evidence_hash ~ '^[0-9a-f]{64}$'),
  generated_at TIMESTAMPTZ NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_validation_snapshots_scope
  ON system_validation_snapshots(ativo, timeframe, from_run, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_system_validation_snapshots_generated
  ON system_validation_snapshots(generated_at DESC, id DESC);

CREATE OR REPLACE FUNCTION reject_system_validation_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'system_validation_snapshots are immutable';
END;
$$;

DROP TRIGGER IF EXISTS system_validation_snapshots_immutable ON system_validation_snapshots;
CREATE TRIGGER system_validation_snapshots_immutable
  BEFORE UPDATE OR DELETE ON system_validation_snapshots
  FOR EACH ROW EXECUTE FUNCTION reject_system_validation_snapshot_mutation();
