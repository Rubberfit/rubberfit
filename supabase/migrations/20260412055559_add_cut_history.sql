-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260412055559_add_cut_history.sql
-- Creates cut_history table with RLS policies
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop existing RLS policies if they exist
DROP POLICY IF EXISTS cut_history_select_own        ON cut_history;
DROP POLICY IF EXISTS cut_history_insert_own        ON cut_history;
DROP POLICY IF EXISTS cut_history_delete_own        ON cut_history;
DROP POLICY IF EXISTS cut_history_select_all        ON cut_history;
DROP POLICY IF EXISTS cut_history_select_privileged ON cut_history;
DROP POLICY IF EXISTS cut_history_delete_privileged ON cut_history;
DROP POLICY IF EXISTS admins_managers_delete_cut_history ON cut_history;

-- Enable Row Level Security (safe if already enabled)
ALTER TABLE cut_history ENABLE ROW LEVEL SECURITY;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_cut_history_user_id     ON cut_history(user_id);
CREATE INDEX IF NOT EXISTS idx_cut_history_material_id ON cut_history(material_id);
CREATE INDEX IF NOT EXISTS idx_cut_history_cut_date    ON cut_history(cut_date);

-- RLS policies for cut_history

-- Users can only view their own cut history
CREATE POLICY cut_history_select_own
  ON cut_history FOR SELECT
  USING (user_id = auth.uid());

-- Users can only update their own cut history
CREATE POLICY cut_history_update_own
  ON cut_history FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own cut history
CREATE POLICY users_delete_own_cut_history
  ON cut_history FOR DELETE
  USING (auth.uid() = user_id);


-- Admins, managers, and supervisors can view all cut history
CREATE POLICY cut_history_select_all
  ON cut_history FOR SELECT
  USING (
    has_any_role(auth.uid(), ARRAY['admin', 'manager', 'supervisor'])
  );

-- Admins and managers can delete cut history
CREATE POLICY admins_managers_delete_cut_history
ON cut_history FOR DELETE
USING (
  has_any_role(auth.uid(), ARRAY['admin', 'manager', 'supervisor'])
);

-- Admins and managers can delete any cut history
CREATE POLICY cut_history_delete_privileged
  ON cut_history FOR DELETE
  USING (
    has_any_role(auth.uid(), ARRAY['admin', 'manager', 'supervisor'])
  );