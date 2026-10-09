ALTER TABLE instruments
  DROP CONSTRAINT IF EXISTS instruments_venue_check;

ALTER TABLE instruments
  ADD CONSTRAINT instruments_venue_check
  CHECK (venue IN ('binance_spot', 'saxo', 'ig', 'xtb'));

UPDATE instruments
SET
  venue = 'saxo',
  data_provider = 'saxo-sim',
  metadata_status = 'pending_broker_confirmation',
  metadata_source = 'Saxo OpenAPI Reference Data; account-specific validation required'
WHERE symbol = 'EURUSD'
  AND venue = 'ig';
