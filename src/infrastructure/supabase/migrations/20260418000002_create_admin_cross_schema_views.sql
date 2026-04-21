-- Migration: 20260418000002_create_admin_cross_schema_views.sql
--
-- Creates cross-schema views in the admin schema that join against public tables.
-- Split from 20260418000001 so the core admin.health_* tables can be applied
-- independently of unrelated public schema state (rolls, reorder_rules, etc.).
--
-- Prerequisites:
--   20260418000001_create_admin_tables.sql must be applied first.
--   public.rolls, public.material_types, public.reorder_rules must exist.
--   public.notification_queue must exist.


-- ── View: admin.public_low_stock_summary ──────────────────────────────────────
-- Counts rolls below their reorder threshold, grouped by material type.

CREATE OR REPLACE VIEW admin.public_low_stock_summary AS
SELECT
  mt.name  AS material_type,
  COUNT(*) AS rolls_below_threshold
FROM  public.rolls r
JOIN  public.material_types mt ON mt.id = r.material_type_id
JOIN  public.reorder_rules  rr ON rr.material_type_id = r.material_type_id
WHERE r.remaining_length <= rr.reorder_point
GROUP BY mt.name;

COMMENT ON VIEW admin.public_low_stock_summary IS
  'Cross-schema: counts rolls below reorder threshold per material type. Used by admin health monitoring.';


-- ── View: admin.public_notification_queue_depth ───────────────────────────────
-- Notification queue depth by status — used to detect processing lag.

CREATE OR REPLACE VIEW admin.public_notification_queue_depth AS
SELECT
  status,
  COUNT(*)        AS count,
  MIN(created_at) AS oldest_entry
FROM public.notification_queue
GROUP BY status;

COMMENT ON VIEW admin.public_notification_queue_depth IS
  'Cross-schema: notification queue depth by status. Used by admin health monitoring to detect processing lag.';
