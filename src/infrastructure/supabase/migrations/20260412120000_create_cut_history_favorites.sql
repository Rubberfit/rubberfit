-- Migration: 20260412120000_create_cut_history_favorites.sql
-- Stores per-user favorite cut history entries.
-- Favorites are private to each user (RLS scoped to user_id).

CREATE TABLE IF NOT EXISTS cut_history_favorites (
  id              SERIAL PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cut_history_id  INT  NOT NULL REFERENCES cut_history(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, cut_history_id)
);

ALTER TABLE cut_history_favorites ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_favorites_user_id        ON cut_history_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_cut_history_id ON cut_history_favorites(cut_history_id);

-- Each user can only see, insert, and delete their own favorites.
CREATE POLICY favorites_select_own
  ON cut_history_favorites FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY favorites_insert_own
  ON cut_history_favorites FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY favorites_delete_own
  ON cut_history_favorites FOR DELETE
  USING (user_id = auth.uid());

COMMENT ON TABLE cut_history_favorites IS
  'Tracks which cut_history rows each user has starred/favorited. One row per (user, cut) pair.';
