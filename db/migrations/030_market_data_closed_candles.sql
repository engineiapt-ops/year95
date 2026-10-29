-- Persist candle close timestamps and provider provenance without guessing historical values.
-- Existing rows remain intact; only newly ingested closed candles populate these fields.
ALTER TABLE market_data
  ADD COLUMN IF NOT EXISTS close_time TIMESTAMPTZ;

ALTER TABLE market_data
  ADD COLUMN IF NOT EXISTS data_provider TEXT;
