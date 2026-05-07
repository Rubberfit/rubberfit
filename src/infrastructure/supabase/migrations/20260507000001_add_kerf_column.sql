-- Migration: 20260507000001_add_kerf_column.sql
-- Adds the `kerf` column to `cut_history` and `cuts` for environments
-- where the original CREATE migrations had already been applied before
-- commit a6734536d (port Rubberfit's tag legend + configurable kerf,
-- 2026-04-30) edited the CREATE migrations in-place to include the
-- column.
--
-- Local / freshly-reset databases got `kerf` from the CREATE
-- migrations directly — for them this is a no-op. Existing remote
-- projects (production / staging Supabase) need this forward ALTER
-- so PostgREST stops returning PGRST204 ("Could not find the 'kerf'
-- column ... in the schema cache") on cut-save inserts.

-- Use DECIMAL(10,4) (not FLOAT) so cut_history.kerf matches
-- cuts.kerf — same logical measurement, same exact-precision type,
-- so cross-table joins / archives stay byte-equal and rounded
-- values like 0.125 round-trip without floating-point drift.
ALTER TABLE cut_history
  ADD COLUMN IF NOT EXISTS kerf DECIMAL(10,4) NOT NULL DEFAULT 0.125;

-- Idempotent narrow if a prior schema (or a fresh-reset DB created
-- before this migration was added) ended up with the FLOAT shape:
-- bring it in line with cuts.kerf so the data type stays uniform.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'cut_history'
       AND column_name = 'kerf'
       AND data_type = 'double precision'
  ) THEN
    ALTER TABLE cut_history
      ALTER COLUMN kerf TYPE DECIMAL(10,4) USING kerf::numeric(10,4);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'non_negative_kerf'
  ) THEN
    ALTER TABLE cut_history
      ADD CONSTRAINT non_negative_kerf CHECK (kerf >= 0);
  END IF;
END $$;

COMMENT ON COLUMN cut_history.kerf IS
  'Saw-blade kerf width in inches; the packer used this as inter-part clearance.';

ALTER TABLE cuts
  ADD COLUMN IF NOT EXISTS kerf DECIMAL(10,4) NOT NULL DEFAULT 0.125;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cuts_kerf_check'
  ) THEN
    ALTER TABLE cuts
      ADD CONSTRAINT cuts_kerf_check CHECK (kerf >= 0);
  END IF;
END $$;

COMMENT ON COLUMN cuts.kerf IS
  'Saw-blade kerf width in inches (inter-part clearance the packer enforced).';

-- Reload PostgREST schema cache so the column is immediately visible
-- to the API layer without requiring a manual API restart.
NOTIFY pgrst, 'reload schema';
