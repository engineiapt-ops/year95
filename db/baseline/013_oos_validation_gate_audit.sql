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
