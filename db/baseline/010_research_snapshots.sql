CREATE TABLE IF NOT EXISTS research_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  signal_id BIGINT NOT NULL REFERENCES signals(id) ON DELETE RESTRICT,
  decision_log_id BIGINT REFERENCES decision_log(id) ON DELETE SET NULL,
  ativo TEXT NOT NULL,
  timeframe TEXT NOT NULL CHECK (timeframe IN ('1h', '4h', '1d')),
  data_as_of TIMESTAMPTZ NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (signal_id)
);

CREATE INDEX IF NOT EXISTS idx_research_snapshots_signal
  ON research_snapshots(signal_id);

CREATE INDEX IF NOT EXISTS idx_research_snapshots_decision_log
  ON research_snapshots(decision_log_id);

CREATE INDEX IF NOT EXISTS idx_research_snapshots_asset_time
  ON research_snapshots(ativo, timeframe, data_as_of);

CREATE OR REPLACE FUNCTION reject_research_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'research_snapshots are immutable';
END;
$$;

DROP TRIGGER IF EXISTS research_snapshots_immutable ON research_snapshots;
CREATE TRIGGER research_snapshots_immutable
  BEFORE UPDATE OR DELETE ON research_snapshots
  FOR EACH ROW EXECUTE FUNCTION reject_research_snapshot_mutation();
