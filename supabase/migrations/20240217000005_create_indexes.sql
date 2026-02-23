-- Indexes for material_types table
CREATE INDEX IF NOT EXISTS idx_material_types_name ON material_types(name);
CREATE INDEX IF NOT EXISTS idx_material_types_created_at ON material_types(created_at);

-- Indexes for rolls table
CREATE INDEX IF NOT EXISTS idx_rolls_material_type ON rolls(material_type);
CREATE INDEX IF NOT EXISTS idx_rolls_status ON rolls(status);
CREATE INDEX IF NOT EXISTS idx_rolls_material_status ON rolls(material_type, status);
CREATE INDEX IF NOT EXISTS idx_rolls_material_type_id ON rolls(material_type_id);
CREATE INDEX IF NOT EXISTS idx_rolls_location ON rolls(location);
CREATE INDEX IF NOT EXISTS idx_rolls_supplier ON rolls(supplier);
CREATE INDEX IF NOT EXISTS idx_rolls_date_received ON rolls(date_received);
CREATE INDEX IF NOT EXISTS idx_rolls_remaining_length ON rolls(remaining_length);
CREATE INDEX IF NOT EXISTS idx_rolls_created_at ON rolls(created_at);

-- Composite index for cut optimization queries
CREATE INDEX IF NOT EXISTS idx_rolls_optimization ON rolls(material_type, status, width, remaining_length)
  WHERE status = 'active';

-- Indexes for cuts table
CREATE INDEX IF NOT EXISTS idx_cuts_roll_id ON cuts(roll_id);
CREATE INDEX IF NOT EXISTS idx_cuts_created_at ON cuts(created_at);
CREATE INDEX IF NOT EXISTS idx_cuts_job_reference ON cuts(job_reference);
CREATE INDEX IF NOT EXISTS idx_cuts_cut_by ON cuts(cut_by);
CREATE INDEX IF NOT EXISTS idx_cuts_created_at_desc ON cuts(created_at DESC);

-- Indexes for notifications table
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_material_type ON notifications(material_type);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(is_read, created_at DESC)
  WHERE is_read = false;

-- Add comments for index purposes
COMMENT ON INDEX idx_rolls_optimization IS 'Optimized index for cut optimization algorithm queries';
COMMENT ON INDEX idx_notifications_unread IS 'Optimized index for fetching unread notifications';
COMMENT ON INDEX idx_cuts_created_at_desc IS 'Optimized index for recent cuts dashboard queries';