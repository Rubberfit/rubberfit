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
