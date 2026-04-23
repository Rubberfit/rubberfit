-- Migration: 20260424000001_cut_history_source.sql
-- Tags every cut-history row with the surface that created it.
-- Lets the jobs surface / analytics / history UI distinguish auto-
-- packed cuts (pack-cli produced the layout) from manual placements
-- made on the Free-roam canvas. Defaults to 'auto' so existing
-- rows + any caller that hasn't been updated reads as auto-nest.

ALTER TABLE cut_history
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'auto';

COMMENT ON COLUMN cut_history.source IS
  'Which cutting-engine surface recorded this cut. `auto` = pack-cli computed the layout (Auto-nest tab); `manual` = operator authored the layout on the Free-roam canvas.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cut_history_source_check'
  ) THEN
    ALTER TABLE cut_history
      ADD CONSTRAINT cut_history_source_check
      CHECK (source IN ('auto', 'manual'));
  END IF;
END;
$$;

-- Back-fill is a no-op because the column default handles it on
-- existing rows — the NOT NULL DEFAULT above propagates 'auto' to
-- every pre-existing row at ALTER time.

CREATE INDEX IF NOT EXISTS idx_cut_history_source
  ON cut_history(source);
