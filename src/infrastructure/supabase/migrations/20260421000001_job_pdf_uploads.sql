-- Migration: 20260421000001_job_pdf_uploads.sql
-- Creates the job-pdfs storage bucket for shareable job sheets.
--
-- Unlike cut-history-pdfs (public + getPublicUrl), job PDFs carry
-- customer info (name, PO number, contact details) and are sent
-- to external recipients as share links. The bucket is PRIVATE;
-- the service wrapper generates signed URLs with a 7-day TTL so
-- the link works without login but expires predictably.

INSERT INTO storage.buckets (id, name, public)
VALUES ('job-pdfs', 'job-pdfs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "job_pdfs_select" ON storage.objects;
DROP POLICY IF EXISTS "job_pdfs_insert" ON storage.objects;
DROP POLICY IF EXISTS "job_pdfs_update" ON storage.objects;
DROP POLICY IF EXISTS "job_pdfs_delete" ON storage.objects;

-- Only the uploading user can read their own objects via the REST
-- API. Signed URLs are issued through the storage API and bypass
-- RLS by design — that's how external recipients without a Rubberfit
-- login can still open the PDF until the URL expires.
CREATE POLICY "job_pdfs_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'job-pdfs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "job_pdfs_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'job-pdfs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "job_pdfs_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'job-pdfs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'job-pdfs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "job_pdfs_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'job-pdfs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
