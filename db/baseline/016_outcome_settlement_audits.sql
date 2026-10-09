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
