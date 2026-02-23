
-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type VARCHAR(50) NOT NULL CHECK (type IN ('low_stock', 'roll_depleted', 'cut_completed', 'system_alert')),
  title VARCHAR(200) NOT NULL,
  description TEXT,
  material_type VARCHAR(100),
  current_value DECIMAL(10,2),
  threshold_value DECIMAL(10,2),
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add table and column comments
COMMENT ON TABLE notifications IS 'System notifications for alerts, warnings, and status updates';
COMMENT ON COLUMN notifications.id IS 'Unique identifier for the notification';
COMMENT ON COLUMN notifications.type IS 'Type of notification: low_stock, roll_depleted, cut_completed, system_alert';
COMMENT ON COLUMN notifications.title IS 'Short descriptive title for the notification';
COMMENT ON COLUMN notifications.description IS 'Detailed description or message body';
COMMENT ON COLUMN notifications.material_type IS 'Related material type (if applicable)';
COMMENT ON COLUMN notifications.current_value IS 'Current value for threshold-based notifications';
COMMENT ON COLUMN notifications.threshold_value IS 'Threshold value that triggered the notification';
COMMENT ON COLUMN notifications.is_read IS 'Whether the notification has been read by user';
COMMENT ON COLUMN notifications.created_at IS 'Timestamp when notification was created';
COMMENT ON COLUMN notifications.updated_at IS 'Timestamp when notification was last updated';