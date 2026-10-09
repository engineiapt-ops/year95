-- Defense in depth: public tables remain inaccessible to direct client roles.
-- No policies or grants are added; Fastify remains the authenticated application boundary.
ALTER TABLE backtest_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE benchmark_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE benchmark_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE instruments ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE oos_validation_gate_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE outcome_settlement_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_audit_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_equity_curve ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_validation_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE walk_forward_folds ENABLE ROW LEVEL SECURITY;
ALTER TABLE walk_forward_portfolio_equity ENABLE ROW LEVEL SECURITY;
ALTER TABLE walk_forward_portfolio_folds ENABLE ROW LEVEL SECURITY;
ALTER TABLE walk_forward_portfolio_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE walk_forward_runs ENABLE ROW LEVEL SECURITY;

-- These trigger functions only raise fixed exceptions and need no application schema lookup.
ALTER FUNCTION reject_oos_validation_gate_audit_mutation() SET search_path = pg_catalog;
ALTER FUNCTION reject_outcome_settlement_audit_mutation() SET search_path = pg_catalog;
ALTER FUNCTION reject_pipeline_audit_snapshot_mutation() SET search_path = pg_catalog;
ALTER FUNCTION reject_research_snapshot_mutation() SET search_path = pg_catalog;
ALTER FUNCTION reject_system_validation_snapshot_mutation() SET search_path = pg_catalog;
