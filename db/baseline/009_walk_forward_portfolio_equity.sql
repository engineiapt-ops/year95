CREATE TABLE IF NOT EXISTS walk_forward_portfolio_equity (
  id BIGSERIAL PRIMARY KEY,
  walk_forward_portfolio_run_id BIGINT NOT NULL REFERENCES walk_forward_portfolio_runs(id) ON DELETE CASCADE,
  fold_number INT NOT NULL,
  as_of TIMESTAMPTZ NOT NULL,
  equity NUMERIC NOT NULL,
  cash NUMERIC NOT NULL,
  realized_pnl NUMERIC NOT NULL DEFAULT 0,
  unrealized_pnl NUMERIC NOT NULL DEFAULT 0,
  gross_exposure NUMERIC NOT NULL DEFAULT 0,
  open_positions INT NOT NULL DEFAULT 0,
  drawdown_pct NUMERIC NOT NULL DEFAULT 0,
  UNIQUE (walk_forward_portfolio_run_id, as_of)
);

CREATE INDEX IF NOT EXISTS idx_wf_portfolio_equity_run_time
  ON walk_forward_portfolio_equity(walk_forward_portfolio_run_id, as_of);
