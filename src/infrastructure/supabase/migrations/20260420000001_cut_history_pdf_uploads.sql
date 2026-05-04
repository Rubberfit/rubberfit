-- Migration: 20260420000001_cut_history_pdf_uploads.sql
-- Adds stock_label / cost_per_sqft / pdf_url columns to cut_history and
-- creates the cut-history-pdfs storage bucket with per-user RLS.
--
-- Without these columns the /api/cuts/history POST insert fails, and without
-- the bucket the subsequent PDF upload 404s from storage.

ALTER TABLE cut_history
  ADD COLUMN IF NOT EXISTS stock_label   TEXT,
  ADD COLUMN IF NOT EXISTS cost_per_sqft DECIMAL(10,4) CHECK (cost_per_sqft IS NULL OR cost_per_sqft >= 0),
  ADD COLUMN IF NOT EXISTS pdf_url       TEXT;

COMMENT ON COLUMN cut_history.stock_label   IS 'Display label for the stock material used (preset label or free-form).';
COMMENT ON COLUMN cut_history.cost_per_sqft IS 'Per-sqft material cost captured at cut time, for historical cost reporting.';
COMMENT ON COLUMN cut_history.pdf_url       IS 'Public URL of the generated cut-report PDF stored in cut-history-pdfs bucket.';

-- ─────────────────────────────────────────────────────────────
-- Storage bucket + RLS
-- Public bucket because getPublicUrl() is stored in cut_history.pdf_url
-- and rendered directly from the UI. Object names are scoped by user id,
-- so RLS still prevents users from writing outside their own folder.
-- ─────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('cut-history-pdfs', 'cut-history-pdfs', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "cut_history_pdfs_select" ON storage.objects;
DROP POLICY IF EXISTS "cut_history_pdfs_insert" ON storage.objects;
DROP POLICY IF EXISTS "cut_history_pdfs_update" ON storage.objects;
DROP POLICY IF EXISTS "cut_history_pdfs_delete" ON storage.objects;

-- Anyone authenticated can read (bucket is public so this mainly covers the REST path).
CREATE POLICY "cut_history_pdfs_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'cut-history-pdfs');

-- Writes are scoped to the user's own folder: first path segment must equal auth.uid().
CREATE POLICY "cut_history_pdfs_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'cut-history-pdfs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "cut_history_pdfs_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'cut-history-pdfs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'cut-history-pdfs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "cut_history_pdfs_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'cut-history-pdfs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ─────────────────────────────────────────────────────────────
-- Fix: cut_history_update_own policy was declared FOR INSERT by
-- mistake (see 20260412055559_add_cut_history.sql). Without a real
-- UPDATE policy, .update({ pdf_url }) silently matched zero rows
-- and the pdf_url column stayed null after every cut.
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS cut_history_update_own ON cut_history;

CREATE POLICY cut_history_update_own
  ON cut_history FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
