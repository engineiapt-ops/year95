CREATE TABLE IF NOT EXISTS instruments (
  symbol TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  asset_class TEXT NOT NULL CHECK (asset_class IN ('crypto_spot', 'cfd')),
  venue TEXT NOT NULL CHECK (venue IN ('binance_spot', 'ig', 'xtb')),
  base_currency TEXT NOT NULL,
  quote_currency TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  data_provider TEXT NOT NULL,
  metadata_status TEXT NOT NULL CHECK (
    metadata_status IN ('verified', 'pending_broker_confirmation')
  ),
  metadata_source TEXT NOT NULL,
  min_order_size NUMERIC,
  max_order_size NUMERIC,
  leverage NUMERIC,
  margin_percent NUMERIC,
  spread NUMERIC,
  overnight_financing NUMERIC,
  commission NUMERIC,
  trading_hours TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_instruments_enabled
  ON instruments(enabled);

INSERT INTO instruments (
  symbol,
  display_name,
  asset_class,
  venue,
  base_currency,
  quote_currency,
  enabled,
  data_provider,
  metadata_status,
  metadata_source,
  trading_hours
)
VALUES (
  'BTCUSDT',
  'Bitcoin / Tether',
  'crypto_spot',
  'binance_spot',
  'BTC',
  'USDT',
  TRUE,
  'Binance Spot',
  'verified',
  'Binance Spot exchangeInfo endpoint',
  '24/7'
)
ON CONFLICT (symbol) DO NOTHING;

INSERT INTO instruments (
  symbol,
  display_name,
  asset_class,
  venue,
  base_currency,
  quote_currency,
  enabled,
  data_provider,
  metadata_status,
  metadata_source
)
VALUES
  ('EURUSD', 'Euro / US Dollar CFD', 'cfd', 'ig', 'EUR', 'USD', FALSE, 'TODO_CONFIRMAR_NA_CORRETORA', 'pending_broker_confirmation', 'TODO_CONFIRMAR_NA_CORRETORA'),
  ('US500', 'US 500 CFD', 'cfd', 'ig', 'USD', 'USD', FALSE, 'TODO_CONFIRMAR_NA_CORRETORA', 'pending_broker_confirmation', 'TODO_CONFIRMAR_NA_CORRETORA'),
  ('BTCUSD', 'Bitcoin / US Dollar CFD', 'cfd', 'ig', 'BTC', 'USD', FALSE, 'TODO_CONFIRMAR_NA_CORRETORA', 'pending_broker_confirmation', 'TODO_CONFIRMAR_NA_CORRETORA')
ON CONFLICT (symbol) DO NOTHING;
