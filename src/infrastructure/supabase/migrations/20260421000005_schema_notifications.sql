-- ═══════════════════════════════════════════════════════════════════════════
-- REDESIGN — File 5 of 9: Notifications schema
-- ═══════════════════════════════════════════════════════════════════════════
-- Tables:
--   notifications       — in-app UI feed (4-value type enum)
--   notification_queue  — async email/SMS dispatch (10-value type enum,
--                         per-channel delivery tracking, retry logic)
--
-- No notification_preferences table — prefs live on
-- `user_preferences.notification_preferences jsonb` (locked decision, file 1).
--
-- Design decisions:
--   • tenant_id on both, ON DELETE CASCADE
--   • user_id (recipient) CASCADEs on user delete — notifications for a
--     deleted user have no owner and should disappear with them
--   • No full audit block — these are system-generated event records.
--     Keep only created_at + updated_at. No created_by (system writes),
--     no deleted_at (cleanup via hard delete / status column).
--   • notifications keeps denormalized material_type / current_value /
--     threshold_value columns for fast UI filtering on low-stock alerts.
--     Other event contexts should use notification_queue.context_data jsonb.
--   • retry strategy columns on notification_queue — the exponential backoff
--     computation lives in the retry trigger (file 8), not here.
--
-- Indexes, triggers, RLS → files 7–9.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── notifications ─────────────────────────────────────────────────────────
-- In-app UI feed. One row per notification shown to a user on the
-- notifications page. Written by notificationService.persistInAppNotification
-- and by low-stock / roll-depletion / cut-completion DB triggers (file 8).

CREATE TABLE notifications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type                varchar(30) NOT NULL
                      CHECK (type IN ('low_stock', 'roll_depleted', 'cut_completed', 'system_alert')),
  title               varchar(200) NOT NULL,
  description         text,
  material_type       varchar(100),
  current_value       numeric(14,3),
  threshold_value     numeric(14,3),
  is_read             boolean NOT NULL DEFAULT false,
  read_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT notifications_read_at_consistent
    CHECK ((is_read = false AND read_at IS NULL) OR (is_read = true AND read_at IS NOT NULL))
);

COMMENT ON TABLE notifications IS
  'In-app UI notification feed. Non-low-stock events persist as system_alert.';
COMMENT ON COLUMN notifications.material_type IS
  'Denormalized material name for low_stock events. NULL for other types.';
COMMENT ON COLUMN notifications.current_value IS
  'Current stock level (for low_stock) or similar numeric context. NULL if inapplicable.';


-- ─── notification_queue ────────────────────────────────────────────────────
-- Async email/SMS dispatch queue. Processed by emailService.processEmailQueue.
-- Retry logic uses exponential backoff set by a BEFORE UPDATE trigger (file 8)
-- when status transitions to 'failed'.

CREATE TABLE notification_queue (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type     varchar(40) NOT NULL
                        CHECK (notification_type IN (
                          'low_stock', 'reorder_triggered', 'po_created', 'po_approved',
                          'delivery_expected', 'delivery_overdue', 'delivery_received',
                          'price_change', 'system_maintenance', 'critical_alert'
                        )),
  title                 varchar(200) NOT NULL,
  message               text NOT NULL,
  send_email            boolean NOT NULL DEFAULT false,
  send_sms              boolean NOT NULL DEFAULT false,
  priority              varchar(10) NOT NULL DEFAULT 'normal'
                        CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  scheduled_for         timestamptz NOT NULL DEFAULT now(),
  status                varchar(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  email_sent_at         timestamptz,
  email_delivered_at    timestamptz,
  email_failed_at       timestamptz,
  email_error_message   text,
  sms_sent_at           timestamptz,
  sms_delivered_at      timestamptz,
  sms_failed_at         timestamptz,
  sms_error_message     text,
  retry_count           integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  max_retries           integer NOT NULL DEFAULT 3 CHECK (max_retries >= 0),
  next_retry_at         timestamptz,
  context_data          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT notification_queue_at_least_one_channel
    CHECK (send_email = true OR send_sms = true),
  CONSTRAINT notification_queue_retry_count_le_max
    CHECK (retry_count <= max_retries)
);

COMMENT ON TABLE notification_queue IS
  'Async dispatch queue for email/SMS. Separate from the in-app notifications table.';
COMMENT ON COLUMN notification_queue.context_data IS
  'Typed event payload (e.g., po_id, material_name, old/new price). Schema lives in src/types/notifications.ts.';
COMMENT ON COLUMN notification_queue.next_retry_at IS
  'Set by BEFORE UPDATE trigger (file 8) when status transitions to failed. Exponential backoff.';
