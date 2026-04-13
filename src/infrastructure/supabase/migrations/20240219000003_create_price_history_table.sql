-- CREATE price_history table for tracking price changes over time
CREATE TABLE IF NOT EXISTS price_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  material_supplier_id UUID NOT NULL REFERENCES material_suppliers(id) ON DELETE CASCADE,
  old_cost_per_sqft DECIMAL(10,4),
  new_cost_per_sqft DECIMAL(10,4) NOT NULL CHECK (new_cost_per_sqft > 0),
  price_change_percentage DECIMAL(8,4), -- Calculated percentage change
  change_reason VARCHAR(200), -- e.g., "Market fluctuation", "Volume discount", etc.
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  changed_by VARCHAR(100), -- Who made the change
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CREATE indexes for performance
CREATE INDEX IF NOT EXISTS idx_price_history_material_supplier ON price_history(material_supplier_id);
CREATE INDEX IF NOT EXISTS idx_price_history_effective_date ON price_history(effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_created_at ON price_history(created_at DESC);

-- Composite index for trending analysis
CREATE INDEX IF NOT EXISTS idx_price_history_trending
  ON price_history(material_supplier_id, effective_date DESC);

-- ADD table and column comments
COMMENT ON TABLE price_history IS 'Historical record of all price changes for material-supplier relationships';
COMMENT ON COLUMN price_history.id IS 'Unique identifier for the price change record';
COMMENT ON COLUMN price_history.material_supplier_id IS 'Foreign key to material_suppliers table';
COMMENT ON COLUMN price_history.old_cost_per_sqft IS 'Previous cost per square foot (NULL for initial price)';
COMMENT ON COLUMN price_history.new_cost_per_sqft IS 'New cost per square foot';
COMMENT ON COLUMN price_history.price_change_percentage IS 'Percentage change from old to new price';
COMMENT ON COLUMN price_history.change_reason IS 'Reason for the price change';
COMMENT ON COLUMN price_history.effective_date IS 'Date when the new price becomes effective';
COMMENT ON COLUMN price_history.changed_by IS 'User who initiated the price change';
COMMENT ON COLUMN price_history.created_at IS 'Timestamp when price change was recorded (immutable)';

-- CREATE function to calculate price change percentage
CREATE OR REPLACE FUNCTION calculate_price_change_percentage()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate percentage change if old_cost_per_sqft is not NULL
  IF NEW.old_cost_per_sqft IS NOT NULL AND NEW.old_cost_per_sqft > 0 THEN
    NEW.price_change_percentage := ROUND(
      ((NEW.new_cost_per_sqft - NEW.old_cost_per_sqft) / NEW.old_cost_per_sqft) * 100,
      2
    );
  ELSE
    NEW.price_change_percentage := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- CREATE trigger to automatically calculate price change percentage
CREATE TRIGGER trigger_calculate_price_change_percentage
  BEFORE INSERT OR UPDATE ON price_history
  FOR EACH ROW
  EXECUTE FUNCTION calculate_price_change_percentage();