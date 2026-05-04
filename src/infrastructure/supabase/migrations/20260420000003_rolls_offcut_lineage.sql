-- Migration: 20260420000003_rolls_offcut_lineage.sql
-- Promotes reusable offcut from an aggregate metric into first-class
-- inventory rows, with a monotonic part-number assigned to every roll
-- (original + offcut) so operators can barcode/scan them uniformly.
--
-- Flow after a cut:
--   • parent roll's remaining_length decrements by cut_length
--   • for each reusable offcut rectangle from the engine, one child
--     row is spawned in `rolls` with is_offcut=true and parent_roll_id
--     pointing back at the source roll
--   • every inserted row (original or offcut) gets a part_number via
--     the `rolls_assign_part_number` trigger
--
-- Schema changes are strictly additive:
--   • parent_roll_id — nullable FK, NULL for original rolls
--   • is_offcut       — boolean, default false
--   • part_number     — UNIQUE text, auto-assigned on insert
-- Existing rows get back-filled part numbers in-migration.

ALTER TABLE rolls
  ADD COLUMN IF NOT EXISTS parent_roll_id UUID REFERENCES rolls(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_offcut BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS part_number TEXT;

CREATE INDEX IF NOT EXISTS idx_rolls_parent_roll_id
  ON rolls(parent_roll_id)
  WHERE parent_roll_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rolls_is_offcut
  ON rolls(is_offcut)
  WHERE is_offcut = TRUE;

COMMENT ON COLUMN rolls.parent_roll_id IS
  'Set on offcut rolls — points at the source roll that generated this offcut during a cut. NULL on original/purchased rolls.';
COMMENT ON COLUMN rolls.is_offcut IS
  'TRUE when this row represents a reusable offcut produced by a cut. Offcuts appear in the inventory list alongside original rolls so they can be scanned and consumed by future cuts.';
COMMENT ON COLUMN rolls.part_number IS
  'Human-readable unique identifier (RF-000001, RF-000002, …) assigned automatically by the rolls_assign_part_number trigger. Suitable for barcode labels and shop-floor scanning. Shared namespace across originals and offcuts.';

-- ─────────────────────────────────────────────────────────────
-- Part-number sequence + assignment trigger
--
-- Shared sequence across originals and offcuts so each physical
-- piece of material — whether it came in on a PO or was spawned
-- by a cut — has a single scannable identifier. Format:
--   RF-<6-digit zero-padded>   e.g. RF-000042
-- The prefix is fixed here so the barcode layout stays stable;
-- swap it in one place if we ever rebrand.
-- ─────────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS rolls_part_number_seq START 1;

COMMENT ON SEQUENCE rolls_part_number_seq IS
  'Monotonic sequence backing rolls.part_number. Do not reset — consumed values must never reappear on a different physical roll.';

CREATE OR REPLACE FUNCTION rolls_assign_part_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.part_number IS NULL OR NEW.part_number = '' THEN
    NEW.part_number := 'RF-' || LPAD(nextval('rolls_part_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rolls_assign_part_number_trigger ON rolls;
CREATE TRIGGER rolls_assign_part_number_trigger
  BEFORE INSERT ON rolls
  FOR EACH ROW
  EXECUTE FUNCTION rolls_assign_part_number();

-- Back-fill existing rows that predate the column. We advance the
-- sequence row-by-row (rather than one bulk UPDATE with a window
-- function) so concurrent inserts landing mid-migration still get
-- unique numbers — nextval is transaction-safe.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM rolls WHERE part_number IS NULL ORDER BY created_at NULLS LAST, id LOOP
    UPDATE rolls
      SET part_number = 'RF-' || LPAD(nextval('rolls_part_number_seq')::text, 6, '0')
      WHERE id = r.id;
  END LOOP;
END;
$$;

-- Uniqueness + NOT NULL enforced AFTER back-fill so the migration
-- is idempotent on partially-populated environments.
ALTER TABLE rolls ALTER COLUMN part_number SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rolls_part_number_unique'
  ) THEN
    ALTER TABLE rolls ADD CONSTRAINT rolls_part_number_unique UNIQUE (part_number);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_rolls_part_number ON rolls(part_number);
