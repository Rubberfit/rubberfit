-- CREATE material_suppliers junction table for material-supplier pricing relationships
CREATE TABLE IF NOT EXISTS material_suppliers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  material_type_id UUID NOT NULL REFERENCES material_types(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  supplier_material_code VARCHAR(100), -- Supplier's internal code/SKU
  cost_per_sqft DECIMAL(10,4) NOT NULL CHECK (cost_per_sqft > 0),
  minimum_order_sqft DECIMAL(10,2) DEFAULT 0 CHECK (minimum_order_sqft >= 0),
  lead_time_days INTEGER DEFAULT 0 CHECK (lead_time_days >= 0),
  preferred_supplier BOOLEAN DEFAULT FALSE,
  active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  effective_date DATE DEFAULT CURRENT_DATE,
  expiration_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_material_supplier UNIQUE(material_type_id, supplier_id),
  CONSTRAINT valid_date_range CHECK (expiration_date IS NULL OR expiration_date > effective_date)
);

-- CREATE indexes for performance
CREATE INDEX IF NOT EXISTS idx_material_suppliers_material_type ON material_suppliers(material_type_id);
CREATE INDEX IF NOT EXISTS idx_material_suppliers_supplier ON material_suppliers(supplier_id);
CREATE INDEX IF NOT EXISTS idx_material_suppliers_active ON material_suppliers(active);
CREATE INDEX IF NOT EXISTS idx_material_suppliers_preferred ON material_suppliers(preferred_supplier);
CREATE INDEX IF NOT EXISTS idx_material_suppliers_cost ON material_suppliers(cost_per_sqft);
CREATE INDEX IF NOT EXISTS idx_material_suppliers_effective_date ON material_suppliers(effective_date);

-- Composite index for finding best prices
CREATE INDEX IF NOT EXISTS idx_material_suppliers_pricing
  ON material_suppliers(material_type_id, active, cost_per_sqft)
  WHERE active = true;

-- ADD table and column comments
COMMENT ON TABLE material_suppliers IS 'Junction table linking materials to suppliers with pricing and terms';
COMMENT ON COLUMN material_suppliers.id IS 'Unique identifier for the material-supplier relationship';
COMMENT ON COLUMN material_suppliers.material_type_id IS 'Foreign key to material_types table';
COMMENT ON COLUMN material_suppliers.supplier_id IS 'Foreign key to suppliers table';
COMMENT ON COLUMN material_suppliers.supplier_material_code IS 'Supplier internal code/SKU for this material';
COMMENT ON COLUMN material_suppliers.cost_per_sqft IS 'Current cost per square foot from this supplier';
COMMENT ON COLUMN material_suppliers.minimum_order_sqft IS 'Minimum order quantity in square feet';
COMMENT ON COLUMN material_suppliers.lead_time_days IS 'Expected delivery time in days';
COMMENT ON COLUMN material_suppliers.preferred_supplier IS 'Whether this supplier is preferred for this material';
COMMENT ON COLUMN material_suppliers.active IS 'Whether this pricing is currently active';
COMMENT ON COLUMN material_suppliers.effective_date IS 'Date when this pricing becomes effective';
COMMENT ON COLUMN material_suppliers.expiration_date IS 'Date when this pricing expires (NULL = no expiration)';
COMMENT ON COLUMN material_suppliers.created_at IS 'Timestamp when record was created';
COMMENT ON COLUMN material_suppliers.updated_at IS 'Timestamp when record was last updated';