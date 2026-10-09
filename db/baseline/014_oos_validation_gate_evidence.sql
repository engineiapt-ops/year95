ALTER TABLE oos_validation_gate_audits
  ADD COLUMN IF NOT EXISTS evidence JSONB;
