-- Create notification_queue table
CREATE TABLE IF NOT EXISTS notification_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_identifier VARCHAR(255) NOT NULL,
  notification_type VARCHAR(50) NOT NULL CHECK (
    notification_type IN (
      'low_stock', 'reorder_triggered', 'po_created', 'po_approved',
      'delivery_expected', 'delivery_overdue', 'delivery_received',
      'price_change', 'system_maintenance', 'critical_alert'
    )
  ),
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,

  -- Delivery channels
  send_email BOOLEAN DEFAULT FALSE,
  send_sms BOOLEAN DEFAULT FALSE,

  -- Priority and timing
  priority VARCHAR(10) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  scheduled_for TIMESTAMPTZ DEFAULT NOW(),

  -- Status tracking
  status VARCHAR(20) DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')
  ),

  -- Delivery tracking
  email_sent_at TIMESTAMPTZ,
  email_delivered_at TIMESTAMPTZ,
  email_failed_at TIMESTAMPTZ,
  email_error_message TEXT,

  sms_sent_at TIMESTAMPTZ,
  sms_delivered_at TIMESTAMPTZ,
  sms_failed_at TIMESTAMPTZ,
  sms_error_message TEXT,

  -- Retry logic
  retry_count INTEGER DEFAULT 0 CHECK (retry_count >= 0),
  max_retries INTEGER DEFAULT 3 CHECK (max_retries >= 0),
  next_retry_at TIMESTAMPTZ,

  -- Context data (JSON for flexibility)
  context_data JSONB DEFAULT '{}',

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_notification_queue_user ON notification_queue(user_identifier);
CREATE INDEX IF NOT EXISTS idx_notification_queue_type ON notification_queue(notification_type);
CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON notification_queue(status);
CREATE INDEX IF NOT EXISTS idx_notification_queue_priority ON notification_queue(priority);
CREATE INDEX IF NOT EXISTS idx_notification_queue_scheduled ON notification_queue(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_notification_queue_retry ON notification_queue(next_retry_at) WHERE status = 'failed' AND retry_count < max_retries;

-- Composite index for processing queue
CREATE INDEX IF NOT EXISTS idx_notification_queue_processing
  ON notification_queue(status, priority DESC, scheduled_for)
  WHERE status IN ('pending', 'failed');

-- Add column comments
COMMENT ON TABLE notification_queue IS 'Queue for pending notifications with delivery status tracking';
COMMENT ON COLUMN notification_queue.id IS 'Unique identifier for the notification';
COMMENT ON COLUMN notification_queue.user_identifier IS 'Target user identifier';
COMMENT ON COLUMN notification_queue.notification_type IS 'Type of notification (for filtering and preferences)';
COMMENT ON COLUMN notification_queue.title IS 'Notification title/subject';
COMMENT ON COLUMN notification_queue.message IS 'Notification message body';
COMMENT ON COLUMN notification_queue.send_email IS 'Whether to send via email';
COMMENT ON COLUMN notification_queue.send_sms IS 'Whether to send via SMS';
COMMENT ON COLUMN notification_queue.priority IS 'Notification priority (affects processing order)';
COMMENT ON COLUMN notification_queue.scheduled_for IS 'When to send the notification';
COMMENT ON COLUMN notification_queue.status IS 'Current processing status';
COMMENT ON COLUMN notification_queue.retry_count IS 'Number of retry attempts made';
COMMENT ON COLUMN notification_queue.max_retries IS 'Maximum retry attempts allowed';
COMMENT ON COLUMN notification_queue.next_retry_at IS 'When to attempt next retry (for failed notifications)';
COMMENT ON COLUMN notification_queue.context_data IS 'Additional context data in JSON format';
COMMENT ON COLUMN notification_queue.created_at IS 'Timestamp when notification was queued';
COMMENT ON COLUMN notification_queue.updated_at IS 'Timestamp when record was last updated';

-- Create cleanup function
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER := 0;
  temp_count INTEGER;
BEGIN
  -- Delete notifications older than 90 days that are sent or cancelled
  DELETE FROM notification_queue
  WHERE status IN ('sent', 'cancelled')
    AND created_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  -- Delete failed notifications older than 30 days
  DELETE FROM notification_queue
  WHERE status = 'failed'
    AND created_at < NOW() - INTERVAL '30 days'
    AND retry_count >= max_retries;

  GET DIAGNOSTICS temp_count = ROW_COUNT;
  deleted_count = deleted_count + temp_count;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create retry timing function
CREATE OR REPLACE FUNCTION schedule_notification_retry()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update retry timing when status changes to 'failed'
  IF NEW.status = 'failed' AND OLD.status != 'failed' THEN
    -- Exponential backoff: 5 minutes, 15 minutes, 45 minutes, etc.
    NEW.next_retry_at := NOW() + (POWER(3, NEW.retry_count) * INTERVAL '5 minutes');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create retry trigger
CREATE TRIGGER trigger_schedule_notification_retry
  BEFORE UPDATE ON notification_queue
  FOR EACH ROW
  EXECUTE FUNCTION schedule_notification_retry();