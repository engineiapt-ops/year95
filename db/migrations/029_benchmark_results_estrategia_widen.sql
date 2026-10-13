-- Exception proposed in docs/PROJECT-CONTRACT.md §2.11.1.
-- Divergence report: GitHub Actions run 38335232604 found that the live
-- benchmark_results_estrategia_check excludes baseline_risk, although the
-- canonical CHECK permits it. Human approval is required before applying
-- this migration to Supabase; no remote database was changed for this PR.
ALTER TABLE benchmark_results DROP CONSTRAINT IF EXISTS benchmark_results_estrategia_check;
ALTER TABLE benchmark_results ADD CONSTRAINT benchmark_results_estrategia_check CHECK (estrategia IN ('baseline', 'baseline_risk', 'buyhold', 'jev'));
