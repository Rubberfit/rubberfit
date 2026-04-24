-- Migration: 20260421000002_roll_barcodes_and_scan_pdf.sql
-- Persists generated barcode artifacts for rolls and prepares the
-- scan flow to open a PDF directly instead of a web page.
--
-- Design note:
--   • `rolls.part_number` remains the canonical scanner payload.
--     We intentionally do NOT add a second `barcode_value` text
--     column because that would duplicate the same identifier.
--   • What we store is the generated barcode artifact metadata
--     (path + generated timestamp) so the system has a durable
--     record that the barcode was rendered and uploaded.
--   • The scan PDF itself is served from a deterministic route,
--     not a stored URL, so the document never goes stale when roll
--     details change.

ALTER TABLE rolls
  ADD COLUMN IF NOT EXISTS barcode_format TEXT NOT NULL DEFAULT 'code128',
  ADD COLUMN IF NOT EXISTS barcode_asset_path TEXT,
  ADD COLUMN IF NOT EXISTS barcode_generated_at TIMESTAMPTZ;

COMMENT ON COLUMN rolls.barcode_format IS
  'Format used for the stored barcode asset. `part_number` is the canonical payload; this column records how it was rendered.';
COMMENT ON COLUMN rolls.barcode_asset_path IS
  'Supabase Storage object path of the generated barcode PNG for this roll.';
COMMENT ON COLUMN rolls.barcode_generated_at IS
  'Timestamp when the current barcode asset was last generated/uploaded.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rolls_barcode_format_check'
  ) THEN
    ALTER TABLE rolls
      ADD CONSTRAINT rolls_barcode_format_check
      CHECK (barcode_format IN ('code128'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_rolls_barcode_asset_path
  ON rolls(barcode_asset_path)
  WHERE barcode_asset_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rolls_barcode_generated_at
  ON rolls(barcode_generated_at DESC)
  WHERE barcode_generated_at IS NOT NULL;

-- Private bucket: barcode PNGs are stored for traceability / reuse,
-- but the public scan experience now goes through `/r/<part>/pdf`.
INSERT INTO storage.buckets (id, name, public)
VALUES ('roll-barcodes', 'roll-barcodes', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "roll_barcodes_select" ON storage.objects;
DROP POLICY IF EXISTS "roll_barcodes_insert" ON storage.objects;
DROP POLICY IF EXISTS "roll_barcodes_update" ON storage.objects;
DROP POLICY IF EXISTS "roll_barcodes_delete" ON storage.objects;

CREATE POLICY "roll_barcodes_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'roll-barcodes'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "roll_barcodes_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'roll-barcodes'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "roll_barcodes_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'roll-barcodes'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'roll-barcodes'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "roll_barcodes_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'roll-barcodes'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
