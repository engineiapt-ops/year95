CREATE TABLE IF NOT EXISTS pipeline_audit_snapshots (
  id BIGSERIAL PRIMARY KEY,
  walk_forward_run_id BIGINT NOT NULL REFERENCES walk_forward_runs(id) ON DELETE RESTRICT,
  ativo TEXT NOT NULL,
  timeframe TEXT NOT NULL CHECK (timeframe IN ('1h', '4h', '1d')),
  dataset_hash TEXT NOT NULL CHECK (dataset_hash ~ '^[0-9a-f]{64}$'),
  audit_version TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('ready', 'degraded', 'blocked')),
  operational_quality_state TEXT CHECK (operational_quality_state IN ('ready', 'degraded', 'blocked')),
  evidence_hash TEXT NOT NULL CHECK (evidence_hash ~ '^[0-9a-f]{64}$'),
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (walk_forward_run_id, evidence_hash)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_audit_snapshots_run
  ON pipeline_audit_snapshots(walk_forward_run_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_pipeline_audit_snapshots_scope
  ON pipeline_audit_snapshots(ativo, timeframe, created_at DESC);

CREATE OR REPLACE FUNCTION reject_pipeline_audit_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'pipeline_audit_snapshots are immutable';
END;
$$;

DROP TRIGGER IF EXISTS pipeline_audit_snapshots_immutable ON pipeline_audit_snapshots;
CREATE TRIGGER pipeline_audit_snapshots_immutable
  BEFORE UPDATE OR DELETE ON pipeline_audit_snapshots
  FOR EACH ROW EXECUTE FUNCTION reject_pipeline_audit_snapshot_mutation();
