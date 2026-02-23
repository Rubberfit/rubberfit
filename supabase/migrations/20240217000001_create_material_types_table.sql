-- Create material_types table
CREATE TABLE IF NOT EXISTS material_types (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  default_cost DECIMAL(10,2),
  min_stock_alert DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add table comment
COMMENT ON TABLE material_types IS 'Master list of rubber material types with default costs and stock thresholds';
COMMENT ON COLUMN material_types.id IS 'Unique identifier for the material type';
COMMENT ON COLUMN material_types.name IS 'Material type name (e.g., Neoprene, EPDM)';
COMMENT ON COLUMN material_types.description IS 'Detailed description of material properties';
COMMENT ON COLUMN material_types.default_cost IS 'Default cost per square foot in USD';
COMMENT ON COLUMN material_types.min_stock_alert IS 'Minimum square footage before low stock alert triggers';
COMMENT ON COLUMN material_types.created_at IS 'Timestamp when record was created';
COMMENT ON COLUMN material_types.updated_at IS 'Timestamp when record was last updated';