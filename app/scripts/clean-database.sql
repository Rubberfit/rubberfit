-- Rema Portal - Clean Database (Remove all dummy data)
-- This script removes all test data, leaving only material types

-- 1. Delete all cuts (must be first due to foreign key)
DELETE FROM cuts;

-- 2. Delete all rolls
DELETE FROM rolls;

-- 3. Keep material types (these are needed for the app to function)
-- Material types are reference data, not dummy data

-- Verify the cleanup
SELECT
  'Database Cleaned!' as status,
  (SELECT COUNT(*) FROM material_types) as material_types_count,
  (SELECT COUNT(*) FROM rolls) as rolls_count,
  (SELECT COUNT(*) FROM cuts) as cuts_count;
