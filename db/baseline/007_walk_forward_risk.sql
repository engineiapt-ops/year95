ALTER TABLE walk_forward_folds
  DROP CONSTRAINT IF EXISTS walk_forward_folds_estrategia_check;

ALTER TABLE walk_forward_folds
  ADD CONSTRAINT walk_forward_folds_estrategia_check
  CHECK (estrategia IN ('baseline', 'baseline_risk', 'buyhold', 'jev'));

CREATE INDEX IF NOT EXISTS idx_wf_folds_strategy_run
  ON walk_forward_folds(walk_forward_run_id, estrategia);
