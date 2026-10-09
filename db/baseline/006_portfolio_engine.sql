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
