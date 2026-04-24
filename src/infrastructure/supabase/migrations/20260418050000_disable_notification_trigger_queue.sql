-- ─────────────────────────────────────────────────────────────────────────────
-- S1 Task 28: Remove app-side vs DB-side notification_queue double-insert.
--
-- The app-side NotificationService.queueNotification() is now the canonical
-- producer of notification_queue rows (preferences, quiet hours, and toast
-- orchestration all live there). The DB-side trigger
-- trigger_significant_price_change_notification on material_suppliers
-- previously called queue_notification(), which writes into
-- notification_queue. That double-insert is now disabled to avoid races
-- and keep a single source of truth for queued email/SMS dispatch.
--
-- The trigger writes ONLY to notification_queue (via queue_notification);
-- it does not persist anything to the in-app `notifications` table, so the
-- entire trigger is dropped. The helper function queue_notification() is
-- left intact because daily_reorder_check() still calls it, and we preserve
-- trigger_price_change_notification() for manual invocation / rollback if
-- needed — it is simply no longer wired to material_suppliers UPDATE.
-- ─────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trigger_significant_price_change_notification
  ON material_suppliers;
