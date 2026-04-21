-- Migration: 20260420000002_cut_history_roll_link.sql
-- Links cut_history rows back to the inventory roll that sourced the
-- cut, so reusable offcut can be aggregated per-roll and surfaced on
-- the inventory detail drawer.
--
-- Existing cuts predate the roll drawer's "Open in engine" flow and
-- can't reliably be back-filled to a specific roll, so the column is
-- nullable and FK deletes SET NULL (we want to keep the cut history
-- record intact even if the roll is later removed).

ALTER TABLE cut_history
  ADD COLUMN IF NOT EXISTS roll_id UUID REFERENCES rolls(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cut_history_roll_id
  ON cut_history(roll_id)
  WHERE roll_id IS NOT NULL;

COMMENT ON COLUMN cut_history.roll_id IS
  'Inventory roll that sourced this cut (nullable — legacy cuts and manual stock-config cuts have no source roll). FK sets NULL on delete so cut history survives roll removal.';

-- ─────────────────────────────────────────────────────────────
-- RPC: aggregated reusable offcut per roll
--
-- The inventory detail drawer calls this to surface "X sqft of
-- reusable material remains from past cuts on this roll". Runs
-- under RLS — callers only see their own rolls and cuts.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_roll_reusable_offcut(p_roll_id UUID)
RETURNS TABLE (
  roll_id              UUID,
  cut_count            BIGINT,
  total_used_sqft      DOUBLE PRECISION,
  total_reusable_sqft  DOUBLE PRECISION,
  total_scrap_sqft     DOUBLE PRECISION,
  last_cut_at          TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
  SELECT
    p_roll_id                                   AS roll_id,
    COUNT(*)                                    AS cut_count,
    COALESCE(SUM(material_used_sqft), 0)        AS total_used_sqft,
    COALESCE(SUM(reusable_offset_sqft), 0)      AS total_reusable_sqft,
    COALESCE(SUM(scrap_sqft), 0)                AS total_scrap_sqft,
    MAX(cut_date)                               AS last_cut_at
  FROM cut_history
  WHERE cut_history.roll_id = p_roll_id
$$;

COMMENT ON FUNCTION get_roll_reusable_offcut(UUID) IS
  'Aggregates cut_history metrics for a single roll so the inventory detail drawer can show usage totals. SECURITY INVOKER so RLS still enforces ownership on the underlying cut_history rows.';
