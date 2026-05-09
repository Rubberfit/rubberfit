-- ═══════════════════════════════════════════════════════════════════════════
-- REDESIGN — File 10 of 10: Storage buckets + policies
-- ═══════════════════════════════════════════════════════════════════════════
-- Buckets:
--   cut-history-pdfs  — private, per-tenant cut report PDFs (10 MB cap)
--   roll-qr-codes     — private, per-tenant roll QR label PDFs (2 MB cap)
--   roll-barcodes     — private, per-tenant Code128 barcode PNGs (1 MB cap)
--   job-pdfs          — private, per-tenant job sheet PDFs (10 MB cap)
--
-- Path convention (enforced by RLS):
--   cut-history-pdfs:  <tenant_id>/<cut_history_id>.pdf
--   roll-qr-codes:     <tenant_id>/<roll_id>.pdf
--   roll-barcodes:     <tenant_id>/<roll_id>.png
--   job-pdfs:          <tenant_id>/<job_id>.pdf
--
-- The first path segment must be the tenant_id. Policies cast
-- (storage.foldername(name))[1]::uuid and compare against the caller's
-- tenant memberships using auth_user_tenant_ids() from file 9. Platform
-- admins bypass via auth_is_platform_admin().
--
-- storage.objects already has RLS enabled by Supabase — we only add policies.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── Buckets ───────────────────────────────────────────────────────────────
-- ON CONFLICT handles re-runs and flips any pre-existing bucket (e.g., a
-- previously runtime-created public cut-history-pdfs) to the new private
-- config.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('cut-history-pdfs', 'cut-history-pdfs', false, 10 * 1024 * 1024, ARRAY['application/pdf']),
  ('roll-qr-codes',    'roll-qr-codes',    false,  2 * 1024 * 1024, ARRAY['application/pdf']),
  ('roll-barcodes',    'roll-barcodes',    false,  1 * 1024 * 1024, ARRAY['image/png']),
  ('job-pdfs',         'job-pdfs',         false, 10 * 1024 * 1024, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;


-- ═══════════════════════════════════════════════════════════════════════════
-- Policies — cut-history-pdfs
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY cut_history_pdfs_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'cut-history-pdfs'
    AND (
      auth_is_platform_admin()
      OR (storage.foldername(name))[1]::uuid IN (SELECT auth_user_tenant_ids())
    )
  );

CREATE POLICY cut_history_pdfs_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'cut-history-pdfs'
    AND (
      auth_is_platform_admin()
      OR (storage.foldername(name))[1]::uuid IN (SELECT auth_user_tenant_ids())
    )
  );

CREATE POLICY cut_history_pdfs_update ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'cut-history-pdfs'
    AND (
      auth_is_platform_admin()
      OR (storage.foldername(name))[1]::uuid IN (SELECT auth_user_tenant_ids())
    )
  )
  WITH CHECK (
    bucket_id = 'cut-history-pdfs'
    AND (
      auth_is_platform_admin()
      OR (storage.foldername(name))[1]::uuid IN (SELECT auth_user_tenant_ids())
    )
  );

CREATE POLICY cut_history_pdfs_delete ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'cut-history-pdfs'
    AND (
      auth_is_platform_admin()
      OR (storage.foldername(name))[1]::uuid IN (SELECT auth_user_tenant_ids())
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- Policies — roll-qr-codes
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY roll_qr_codes_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'roll-qr-codes'
    AND (
      auth_is_platform_admin()
      OR (storage.foldername(name))[1]::uuid IN (SELECT auth_user_tenant_ids())
    )
  );

CREATE POLICY roll_qr_codes_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'roll-qr-codes'
    AND (
      auth_is_platform_admin()
      OR (storage.foldername(name))[1]::uuid IN (SELECT auth_user_tenant_ids())
    )
  );

CREATE POLICY roll_qr_codes_update ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'roll-qr-codes'
    AND (
      auth_is_platform_admin()
      OR (storage.foldername(name))[1]::uuid IN (SELECT auth_user_tenant_ids())
    )
  )
  WITH CHECK (
    bucket_id = 'roll-qr-codes'
    AND (
      auth_is_platform_admin()
      OR (storage.foldername(name))[1]::uuid IN (SELECT auth_user_tenant_ids())
    )
  );

CREATE POLICY roll_qr_codes_delete ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'roll-qr-codes'
    AND (
      auth_is_platform_admin()
      OR (storage.foldername(name))[1]::uuid IN (SELECT auth_user_tenant_ids())
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- Policies — roll-barcodes
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY roll_barcodes_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'roll-barcodes'
    AND (
      auth_is_platform_admin()
      OR (storage.foldername(name))[1]::uuid IN (SELECT auth_user_tenant_ids())
    )
  );

CREATE POLICY roll_barcodes_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'roll-barcodes'
    AND (
      auth_is_platform_admin()
      OR (storage.foldername(name))[1]::uuid IN (SELECT auth_user_tenant_ids())
    )
  );

CREATE POLICY roll_barcodes_update ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'roll-barcodes'
    AND (
      auth_is_platform_admin()
      OR (storage.foldername(name))[1]::uuid IN (SELECT auth_user_tenant_ids())
    )
  )
  WITH CHECK (
    bucket_id = 'roll-barcodes'
    AND (
      auth_is_platform_admin()
      OR (storage.foldername(name))[1]::uuid IN (SELECT auth_user_tenant_ids())
    )
  );

CREATE POLICY roll_barcodes_delete ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'roll-barcodes'
    AND (
      auth_is_platform_admin()
      OR (storage.foldername(name))[1]::uuid IN (SELECT auth_user_tenant_ids())
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- Policies — job-pdfs
-- ═══════════════════════════════════════════════════════════════════════════
-- Note: external recipients (customers receiving a share link) bypass these
-- policies via signed URLs issued through the storage API. RLS gates only
-- direct REST access by authenticated users; signed-URL reads are how
-- customer share-links continue to work without forcing a portal login.

CREATE POLICY job_pdfs_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'job-pdfs'
    AND (
      auth_is_platform_admin()
      OR (storage.foldername(name))[1]::uuid IN (SELECT auth_user_tenant_ids())
    )
  );

CREATE POLICY job_pdfs_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'job-pdfs'
    AND (
      auth_is_platform_admin()
      OR (storage.foldername(name))[1]::uuid IN (SELECT auth_user_tenant_ids())
    )
  );

CREATE POLICY job_pdfs_update ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'job-pdfs'
    AND (
      auth_is_platform_admin()
      OR (storage.foldername(name))[1]::uuid IN (SELECT auth_user_tenant_ids())
    )
  )
  WITH CHECK (
    bucket_id = 'job-pdfs'
    AND (
      auth_is_platform_admin()
      OR (storage.foldername(name))[1]::uuid IN (SELECT auth_user_tenant_ids())
    )
  );

CREATE POLICY job_pdfs_delete ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'job-pdfs'
    AND (
      auth_is_platform_admin()
      OR (storage.foldername(name))[1]::uuid IN (SELECT auth_user_tenant_ids())
    )
  );
