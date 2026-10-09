-- Align research snapshot foreign-key column with decision_log.id.
-- The migration is idempotent at the schema level and fails closed when data
-- cannot be safely converted or referenced rows are missing.

DO $$
DECLARE
  constraint_record RECORD;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'research_snapshots'
      AND column_name = 'decision_log_id'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.research_snapshots
      WHERE decision_log_id IS NOT NULL
        AND BTRIM(decision_log_id::text) !~ '^[0-9]+$'
    ) THEN
      RAISE EXCEPTION
        'research_snapshots.decision_log_id contains non-numeric values and cannot be converted to BIGINT';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.research_snapshots rs
      LEFT JOIN public.decision_log dl
        ON dl.id = BTRIM(rs.decision_log_id::text)::BIGINT
      WHERE rs.decision_log_id IS NOT NULL
        AND dl.id IS NULL
    ) THEN
      RAISE EXCEPTION
        'research_snapshots.decision_log_id contains references to missing decision_log rows';
    END IF;

    FOR constraint_record IN
      SELECT tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name
       AND kcu.table_schema = tc.table_schema
       AND kcu.table_name = tc.table_name
      WHERE tc.table_schema = 'public'
        AND tc.table_name = 'research_snapshots'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'decision_log_id'
    LOOP
      EXECUTE format(
        'ALTER TABLE public.research_snapshots DROP CONSTRAINT %I',
        constraint_record.constraint_name
      );
    END LOOP;

    ALTER TABLE public.research_snapshots
      ALTER COLUMN decision_log_id TYPE BIGINT
      USING NULLIF(BTRIM(decision_log_id::text), '')::BIGINT;

    ALTER TABLE public.research_snapshots
      ADD CONSTRAINT research_snapshots_decision_log_id_fkey
      FOREIGN KEY (decision_log_id)
      REFERENCES public.decision_log(id)
      ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_research_snapshots_decision_log
      ON public.research_snapshots(decision_log_id);
  END IF;
END $$;
