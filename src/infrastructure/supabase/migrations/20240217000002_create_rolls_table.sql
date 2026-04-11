-- Create rolls table
CREATE TABLE IF NOT EXISTS rolls (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  material_type_id UUID REFERENCES material_types(id),
  material_type VARCHAR(100) NOT NULL,
  width DECIMAL(10,3) NOT NULL CHECK (width > 0),
  length DECIMAL(10,3) NOT NULL CHECK (length > 0),
  thickness DECIMAL(10,3) NOT NULL CHECK (thickness > 0),
  color VARCHAR(50),
  location VARCHAR(100),
  date_received DATE DEFAULT CURRENT_DATE,
  supplier VARCHAR(200),
  cost_per_sqft DECIMAL(10,4) CHECK (cost_per_sqft >= 0),
  remaining_length DECIMAL(10,3) NOT NULL CHECK (remaining_length >= 0),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'depleted', 'reserved')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add table and column comments
COMMENT ON TABLE rolls IS 'Inventory of rubber material rolls with dimensions and tracking';
COMMENT ON COLUMN rolls.id IS 'Unique identifier for the roll';
COMMENT ON COLUMN rolls.material_type_id IS 'Foreign key reference to material_types table';
COMMENT ON COLUMN rolls.material_type IS 'Denormalized material type name for query efficiency';
COMMENT ON COLUMN rolls.width IS 'Width in inches';
COMMENT ON COLUMN rolls.length IS 'Original length in inches when received';
COMMENT ON COLUMN rolls.thickness IS 'Thickness in inches';
COMMENT ON COLUMN rolls.color IS 'Color designation of the material';
COMMENT ON COLUMN rolls.location IS 'Physical storage location in warehouse';
COMMENT ON COLUMN rolls.date_received IS 'Date when roll was received into inventory';
COMMENT ON COLUMN rolls.supplier IS 'Name of supplier/vendor';
COMMENT ON COLUMN rolls.cost_per_sqft IS 'Cost per square foot for this specific roll';
COMMENT ON COLUMN rolls.remaining_length IS 'Current remaining length in inches after cuts';
COMMENT ON COLUMN rolls.status IS 'active = available, depleted = used up, reserved = allocated for job';
COMMENT ON COLUMN rolls.notes IS 'Additional notes about the roll';
COMMENT ON COLUMN rolls.created_at IS 'Timestamp when record was created';
COMMENT ON COLUMN rolls.updated_at IS 'Timestamp when record was last updated';