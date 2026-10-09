CREATE TABLE IF NOT EXISTS walk_forward_portfolio_runs (
  id BIGSERIAL PRIMARY KEY,
  walk_forward_run_id BIGINT NOT NULL REFERENCES walk_forward_runs(id) ON DELETE CASCADE,
  strategy TEXT NOT NULL CHECK (strategy IN ('baseline', 'baseline_risk')),
  initial_capital NUMERIC NOT NULL,
  position_size_pct NUMERIC NOT NULL,
  max_gross_exposure_pct NUMERIC NOT NULL,
  portfolio_model_version TEXT NOT NULL,
  final_equity NUMERIC NOT NULL DEFAULT 0,
  total_return_pct NUMERIC NOT NULL DEFAULT 0,
  cagr_pct NUMERIC,
  max_drawdown_pct NUMERIC NOT NULL DEFAULT 0,
  sharpe NUMERIC,
  sortino NUMERIC,
  total_signals INT NOT NULL DEFAULT 0,
  executed_trades INT NOT NULL DEFAULT 0,
  closed_trades INT NOT NULL DEFAULT 0,
  rejected_trades INT NOT NULL DEFAULT 0,
  winning_trades INT NOT NULL DEFAULT 0,
  losing_trades INT NOT NULL DEFAULT 0,
  total_realized_pnl NUMERIC NOT NULL DEFAULT 0,
  total_fees NUMERIC NOT NULL DEFAULT 0,
  total_slippage NUMERIC NOT NULL DEFAULT 0,
  max_open_positions INT NOT NULL DEFAULT 0,
  max_gross_exposure NUMERIC NOT NULL DEFAULT 0,
  risk_gate_blocks INT NOT NULL DEFAULT 0,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (walk_forward_run_id, strategy)
);

CREATE TABLE IF NOT EXISTS walk_forward_portfolio_folds (
  id BIGSERIAL PRIMARY KEY,
  walk_forward_portfolio_run_id BIGINT NOT NULL REFERENCES walk_forward_portfolio_runs(id) ON DELETE CASCADE,
  walk_forward_run_id BIGINT NOT NULL REFERENCES walk_forward_runs(id) ON DELETE CASCADE,
  fold_number INT NOT NULL,
  initial_capital NUMERIC NOT NULL,
  final_equity NUMERIC NOT NULL,
  total_return_pct NUMERIC NOT NULL DEFAULT 0,
  max_drawdown_pct NUMERIC NOT NULL DEFAULT 0,
  sharpe NUMERIC,
  sortino NUMERIC,
  total_signals INT NOT NULL DEFAULT 0,
  executed_trades INT NOT NULL DEFAULT 0,
  closed_trades INT NOT NULL DEFAULT 0,
  rejected_trades INT NOT NULL DEFAULT 0,
  winning_trades INT NOT NULL DEFAULT 0,
  losing_trades INT NOT NULL DEFAULT 0,
  total_realized_pnl NUMERIC NOT NULL DEFAULT 0,
  total_fees NUMERIC NOT NULL DEFAULT 0,
  total_slippage NUMERIC NOT NULL DEFAULT 0,
  max_open_positions INT NOT NULL DEFAULT 0,
  max_gross_exposure NUMERIC NOT NULL DEFAULT 0,
  risk_gate_blocks INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (walk_forward_portfolio_run_id, fold_number)
);

CREATE INDEX IF NOT EXISTS idx_wf_portfolio_runs_wf
  ON walk_forward_portfolio_runs(walk_forward_run_id);

CREATE INDEX IF NOT EXISTS idx_wf_portfolio_folds_run
  ON walk_forward_portfolio_folds(walk_forward_portfolio_run_id, fold_number);
