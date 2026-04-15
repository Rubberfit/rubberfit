-- Migration: 20260413000001_add_cut_metrics.sql
-- Adds nesting metric columns to cut_history.
-- Uses DEFAULT 0 so the ALTER succeeds on tables that already have rows.

ALTER TABLE cut_history
  ADD COLUMN IF NOT EXISTS parts_completed     INT   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS material_used_sqft  FLOAT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reusable_offset_sqft FLOAT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scrap_sqft          FLOAT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fab_score           FLOAT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cut_pieces          INT   NOT NULL DEFAULT 0;

-- Stores per-template dimension data for all selected templates in a cut record.
-- Replaces fragile label-regex reconstruction with explicit JSONB storage.
-- Each element corresponds to the same index in part_selected_size_text[].
ALTER TABLE cut_history
  ADD COLUMN IF NOT EXISTS part_custom_dimensions JSONB DEFAULT NULL;
