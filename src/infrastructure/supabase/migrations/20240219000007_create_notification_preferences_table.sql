-- CREATE notification_preferences table for user notification settings
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_identifier VARCHAR(255) NOT NULL, -- Could be email, user ID, or username
  email VARCHAR(255),
  phone VARCHAR(20),
  sms_enabled BOOLEAN DEFAULT FALSE,
  email_enabled BOOLEAN DEFAULT TRUE,

  -- Low stock alerts
  low_stock_enabled BOOLEAN DEFAULT TRUE,
  low_stock_threshold_override DECIMAL(10,2), -- Override global threshold

  -- Reorder alerts
  reorder_triggered_enabled BOOLEAN DEFAULT TRUE,
  po_created_enabled BOOLEAN DEFAULT TRUE,
  po_approved_enabled BOOLEAN DEFAULT FALSE,

  -- Delivery alerts
  delivery_expected_enabled BOOLEAN DEFAULT TRUE,
  delivery_overdue_enabled BOOLEAN DEFAULT TRUE,
  delivery_received_enabled BOOLEAN DEFAULT FALSE,

  -- Price alerts
  price_change_enabled BOOLEAN DEFAULT FALSE,
  price_change_threshold DECIMAL(5,2) DEFAULT 10.0, -- Alert for changes > X%

  -- System alerts
  system_maintenance_enabled BOOLEAN DEFAULT TRUE,
  critical_alerts_enabled BOOLEAN DEFAULT TRUE,

  -- Timing preferences
  quiet_hours_start TIME, -- e.g., '22:00:00'
  quiet_hours_end TIME,   -- e.g., '08:00:00'
  timezone VARCHAR(50) DEFAULT 'America/New_York',

  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_user_identifier UNIQUE(user_identifier),
  CONSTRAINT valid_email_format CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+[.][A-Za-z]+$'),
  CONSTRAINT valid_phone_format CHECK (phone IS NULL OR phone ~ '^\+?[\d\s\-\(\)\.]+$'),
  CONSTRAINT valid_threshold CHECK (price_change_threshold >= 0 AND price_change_threshold <= 100),
  CONSTRAINT sms_requires_phone CHECK (NOT sms_enabled OR phone IS NOT NULL),
  CONSTRAINT email_requires_address CHECK (NOT email_enabled OR email IS NOT NULL)
);

-- CREATE indexes for performance
CREATE INDEX IF NOT EXISTS idx_notification_prefs_user ON notification_preferences(user_identifier);
CREATE INDEX IF NOT EXISTS idx_notification_prefs_active ON notification_preferences(active);
CREATE INDEX IF NOT EXISTS idx_notification_prefs_email ON notification_preferences(email) WHERE email_enabled = true;
CREATE INDEX IF NOT EXISTS idx_notification_prefs_sms ON notification_preferences(phone) WHERE sms_enabled = true;

-- ADD table and column comments
COMMENT ON TABLE notification_preferences IS 'User notification preferences for various alert types';
COMMENT ON COLUMN notification_preferences.id IS 'Unique identifier for the preference record';
COMMENT ON COLUMN notification_preferences.user_identifier IS 'Unique user identifier (email, username, or user ID)';
COMMENT ON COLUMN notification_preferences.email IS 'Email address for notifications';
COMMENT ON COLUMN notification_preferences.phone IS 'Phone number for SMS notifications';
COMMENT ON COLUMN notification_preferences.sms_enabled IS 'Whether SMS notifications are enabled';
COMMENT ON COLUMN notification_preferences.email_enabled IS 'Whether email notifications are enabled';
COMMENT ON COLUMN notification_preferences.low_stock_enabled IS 'Whether to send low stock alerts';
COMMENT ON COLUMN notification_preferences.low_stock_threshold_override IS 'Override global low stock threshold for this user';
COMMENT ON COLUMN notification_preferences.reorder_triggered_enabled IS 'Whether to send reorder rule triggered alerts';
COMMENT ON COLUMN notification_preferences.po_created_enabled IS 'Whether to send PO created alerts';
COMMENT ON COLUMN notification_preferences.price_change_threshold IS 'Alert for price changes greater than this percentage';
COMMENT ON COLUMN notification_preferences.quiet_hours_start IS 'Start time for quiet hours (no notifications)';
COMMENT ON COLUMN notification_preferences.quiet_hours_end IS 'End time for quiet hours';
COMMENT ON COLUMN notification_preferences.timezone IS 'User timezone for notification timing';
COMMENT ON COLUMN notification_preferences.active IS 'Whether notifications are active for this user';
COMMENT ON COLUMN notification_preferences.created_at IS 'Timestamp when record was created';
COMMENT ON COLUMN notification_preferences.updated_at IS 'Timestamp when record was last updated';