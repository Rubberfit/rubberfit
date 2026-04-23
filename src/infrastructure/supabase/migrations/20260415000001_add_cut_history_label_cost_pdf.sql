-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260415000001_add_cut_history_label_cost_pdf.sql
-- Adds stock_label, cost_per_sqft, and pdf_url columns to cut_history.
-- These fields are referenced in the CutHistory TypeScript model and
-- written by the POST /api/cuts/history handler but were never migrated.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE cut_history
  ADD COLUMN IF NOT EXISTS stock_label   TEXT            NULL,
  ADD COLUMN IF NOT EXISTS cost_per_sqft NUMERIC(10,4)   NULL,
  ADD COLUMN IF NOT EXISTS pdf_url       TEXT            NULL;

COMMENT ON COLUMN cut_history.stock_label   IS 'Human-readable label for the stock sheet used (e.g. "48\" × 96\" EPDM").';
COMMENT ON COLUMN cut_history.cost_per_sqft IS 'Cost per square foot of the material at the time of cut.';
COMMENT ON COLUMN cut_history.pdf_url       IS 'URL to the generated cut-sheet PDF stored in Supabase Storage.';
