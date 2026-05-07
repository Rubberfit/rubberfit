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

ALTER TABLE cut_history
  ADD COLUMN IF NOT EXISTS kerf FLOAT NOT NULL DEFAULT 0.125;

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
