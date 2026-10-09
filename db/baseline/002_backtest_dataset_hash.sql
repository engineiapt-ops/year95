-- Migration 002: Adiciona identificadores de dataset para reprodutibilidade determinística de backtests
ALTER TABLE backtest_runs ADD COLUMN IF NOT EXISTS candles_total INT;
ALTER TABLE backtest_runs ADD COLUMN IF NOT EXISTS dataset_hash TEXT;
