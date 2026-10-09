-- Faixa 12: migration for existing PostgreSQL databases.
CREATE TABLE IF NOT EXISTS backtest_runs (
  id BIGSERIAL PRIMARY KEY,
  engine TEXT NOT NULL CHECK (engine IN ('both', 'baseline', 'jev')),
  mode TEXT NOT NULL CHECK (mode IN ('dev', 'oos')),
  ativo TEXT NOT NULL,
  timeframe TEXT NOT NULL CHECK (timeframe IN ('1h', '4h', '1d')),
  periodo_inicio TIMESTAMPTZ NOT NULL,
  periodo_fim TIMESTAMPTZ NOT NULL,
  oos_start_ratio NUMERIC,
  thresholds_congelados_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE signals ADD COLUMN IF NOT EXISTS backtest_run_id BIGINT REFERENCES backtest_runs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_backtest_runs_created ON backtest_runs(criado_em);
CREATE INDEX IF NOT EXISTS idx_signals_backtest_run ON signals(backtest_run_id);
