-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260415000002_create_cut_history_pdfs_bucket.sql
-- Creates the 'cut-history-pdfs' Supabase Storage bucket used by
-- uploadCutPdf() in src/infrastructure/services/cutHistoryService.ts.
-- The bucket is public so getPublicUrl() returns a usable link without
-- requiring a signed URL on every page load.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Create the bucket (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cut-history-pdfs',
  'cut-history-pdfs',
  true,
  10485760,            -- 10 MB per file
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;


-- 2. RLS policies on storage.objects
--    Files are stored under {userId}/{cutId}-{timestamp}.pdf
--    so the first path segment is always the owner's UUID.

-- Users can upload only into their own folder
DROP POLICY IF EXISTS "cut_pdfs_insert_own" ON storage.objects;
CREATE POLICY "cut_pdfs_insert_own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'cut-history-pdfs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can overwrite (upsert) their own files
DROP POLICY IF EXISTS "cut_pdfs_update_own" ON storage.objects;
CREATE POLICY "cut_pdfs_update_own"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'cut-history-pdfs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Anyone authenticated can read (public bucket, but explicit policy is safer)
DROP POLICY IF EXISTS "cut_pdfs_select_public" ON storage.objects;
CREATE POLICY "cut_pdfs_select_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'cut-history-pdfs');
