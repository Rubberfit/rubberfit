-- Create cuts table
CREATE TABLE IF NOT EXISTS cuts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  roll_id UUID REFERENCES rolls(id) ON DELETE SET NULL,
  cut_width DECIMAL(10,3) NOT NULL CHECK (cut_width > 0),
  cut_length DECIMAL(10,3) NOT NULL CHECK (cut_length > 0),
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  waste_sqft DECIMAL(10,4) CHECK (waste_sqft >= 0),
  waste_percentage DECIMAL(5,2) CHECK (waste_percentage >= 0 AND waste_percentage <= 100),
  total_sqft_used DECIMAL(10,4) CHECK (total_sqft_used >= 0),
  job_reference VARCHAR(100),
  cut_by VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add table and column comments
COMMENT ON TABLE cuts IS 'Historical record of all cuts made from inventory rolls';
COMMENT ON COLUMN cuts.id IS 'Unique identifier for the cut record';
COMMENT ON COLUMN cuts.roll_id IS 'Foreign key reference to the source roll (nullable for data integrity)';
COMMENT ON COLUMN cuts.cut_width IS 'Width of cut piece in inches';
COMMENT ON COLUMN cuts.cut_length IS 'Length of cut piece in inches';
COMMENT ON COLUMN cuts.quantity IS 'Number of pieces cut with these dimensions';
COMMENT ON COLUMN cuts.waste_sqft IS 'Waste material in square feet';
COMMENT ON COLUMN cuts.waste_percentage IS 'Percentage of material wasted (0-100%)';
COMMENT ON COLUMN cuts.total_sqft_used IS 'Total material consumed including waste';
COMMENT ON COLUMN cuts.job_reference IS 'Reference to the job or work order';
COMMENT ON COLUMN cuts.cut_by IS 'Name or ID of person who performed the cut';
COMMENT ON COLUMN cuts.notes IS 'Additional notes about the cut operation';
COMMENT ON COLUMN cuts.created_at IS 'Timestamp when the cut was recorded (immutable)';