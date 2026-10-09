CREATE TABLE IF NOT EXISTS system_validation_snapshots (
  id BIGSERIAL PRIMARY KEY,
  ativo TEXT NOT NULL,
  timeframe TEXT NOT NULL CHECK (timeframe IN ('1h', '4h', '1d')),
  from_run BIGINT,
  lookback_days INT NOT NULL CHECK (lookback_days >= 1 AND lookback_days <= 3650),
  validation_version TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('ready', 'degraded', 'blocked')),
  ready_count INT NOT NULL CHECK (ready_count >= 0),
  degraded_count INT NOT NULL CHECK (degraded_count >= 0),
  blocked_count INT NOT NULL CHECK (blocked_count >= 0),
  blocking_failures INT NOT NULL CHECK (blocking_failures >= 0),
  evidence_hash TEXT NOT NULL UNIQUE CHECK (evidence_hash ~ '^[0-9a-f]{64}$'),
  generated_at TIMESTAMPTZ NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_validation_snapshots_scope
  ON system_validation_snapshots(ativo, timeframe, from_run, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_system_validation_snapshots_generated
  ON system_validation_snapshots(generated_at DESC, id DESC);

CREATE OR REPLACE FUNCTION reject_system_validation_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'system_validation_snapshots are immutable';
END;
$$;

DROP TRIGGER IF EXISTS system_validation_snapshots_immutable ON system_validation_snapshots;
CREATE TRIGGER system_validation_snapshots_immutable
  BEFORE UPDATE OR DELETE ON system_validation_snapshots
  FOR EACH ROW EXECUTE FUNCTION reject_system_validation_snapshot_mutation();
