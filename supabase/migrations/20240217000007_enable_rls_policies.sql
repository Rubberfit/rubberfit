-- Enable RLS on all tables
ALTER TABLE material_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE rolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Material Types Policies
-- Allow all operations for authenticated users (shop floor workers)
CREATE POLICY "material_types_select_policy"
  ON material_types FOR SELECT
  USING (true);

CREATE POLICY "material_types_insert_policy"
  ON material_types FOR INSERT
  WITH CHECK (true);

CREATE POLICY "material_types_update_policy"
  ON material_types FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "material_types_delete_policy"
  ON material_types FOR DELETE
  USING (true);

-- Rolls Policies
-- Allow all operations for authenticated users
CREATE POLICY "rolls_select_policy"
  ON rolls FOR SELECT
  USING (true);

CREATE POLICY "rolls_insert_policy"
  ON rolls FOR INSERT
  WITH CHECK (true);

CREATE POLICY "rolls_update_policy"
  ON rolls FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "rolls_delete_policy"
  ON rolls FOR DELETE
  USING (true);

-- Cuts Policies
-- Allow read and insert for all users, but restrict updates/deletes (cuts are historical records)
CREATE POLICY "cuts_select_policy"
  ON cuts FOR SELECT
  USING (true);

CREATE POLICY "cuts_insert_policy"
  ON cuts FOR INSERT
  WITH CHECK (true);

-- Limited update access (only for corrections within 24 hours)
CREATE POLICY "cuts_update_policy"
  ON cuts FOR UPDATE
  USING (created_at > NOW() - INTERVAL '24 hours')
  WITH CHECK (created_at > NOW() - INTERVAL '24 hours');

-- No delete policy for cuts (historical integrity)

-- Notifications Policies
-- Allow all operations for authenticated users
CREATE POLICY "notifications_select_policy"
  ON notifications FOR SELECT
  USING (true);

CREATE POLICY "notifications_insert_policy"
  ON notifications FOR INSERT
  WITH CHECK (true);

CREATE POLICY "notifications_update_policy"
  ON notifications FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "notifications_delete_policy"
  ON notifications FOR DELETE
  USING (true);

-- Add policy comments for documentation
COMMENT ON POLICY "material_types_select_policy" ON material_types IS 'Allows all users to view material types';
COMMENT ON POLICY "rolls_select_policy" ON rolls IS 'Allows all users to view roll inventory';
COMMENT ON POLICY "cuts_select_policy" ON cuts IS 'Allows all users to view cut history';
COMMENT ON POLICY "cuts_update_policy" ON cuts IS 'Allows updates to cuts only within 24 hours of creation (for error corrections)';
COMMENT ON POLICY "notifications_select_policy" ON notifications IS 'Allows all users to view notifications';

-- Note: In production, these policies should be refined to use proper authentication
-- Example: USING (auth.uid() IS NOT NULL) for authenticated users only
-- Or implement role-based access control based on user roles