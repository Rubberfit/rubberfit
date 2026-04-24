-- Migration: 20260424000002_cut_history_layout_json.sql
-- Stores the Free-roam canvas layout snapshot so saved manual cuts
-- can be re-loaded into the CAD surface. Auto-nest cuts leave this
-- null — their layout is recomputable from `part_custom_dimensions`
-- plus the pack-cli engine, no snapshot needed.
--
-- Shape (TypeScript; see `app/dashboard/cutting-engine/_components/
-- use-record-manual-cut.ts`):
--   {
--     version: 1,
--     placements: [{ id, templateId, x, y, rotationRad }],
--     parts:      [PartTemplate],
--     stock:      { width, length, thickness, material, costPerSqft? }
--   }

ALTER TABLE cut_history
  ADD COLUMN IF NOT EXISTS layout_json JSONB;

COMMENT ON COLUMN cut_history.layout_json IS
  'Free-roam layout snapshot — placements + parts queue + stock config. Populated only when `source = manual`. Nullable so auto-nest rows (and pre-migration manual rows) stay clean.';
