-- CREATE purchase_order_items table for PO line items
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  material_type_id UUID NOT NULL REFERENCES material_types(id) ON DELETE RESTRICT,
  line_number INTEGER NOT NULL CHECK (line_number > 0),
  description TEXT NOT NULL,
  width DECIMAL(10,3) CHECK (width IS NULL OR width > 0),
  length DECIMAL(10,3) CHECK (length IS NULL OR length > 0),
  thickness DECIMAL(10,3) CHECK (thickness IS NULL OR thickness > 0),
  color VARCHAR(50),
  quantity_sqft DECIMAL(10,2) NOT NULL CHECK (quantity_sqft > 0),
  unit_cost DECIMAL(10,4) NOT NULL CHECK (unit_cost > 0),
  line_total DECIMAL(12,2) NOT NULL CHECK (line_total >= 0),
  quantity_received DECIMAL(10,2) DEFAULT 0 CHECK (quantity_received >= 0),
  received_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_po_line_number UNIQUE(purchase_order_id, line_number),
  CONSTRAINT valid_received_quantity CHECK (quantity_received <= quantity_sqft),
  CONSTRAINT consistent_line_total CHECK (ABS(line_total - (quantity_sqft * unit_cost)) < 0.01)
);

-- CREATE indexes for performance
CREATE INDEX IF NOT EXISTS idx_po_items_purchase_order ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_po_items_material_type ON purchase_order_items(material_type_id);
CREATE INDEX IF NOT EXISTS idx_po_items_line_number ON purchase_order_items(purchase_order_id, line_number);
CREATE INDEX IF NOT EXISTS idx_po_items_received_date ON purchase_order_items(received_date);

-- Composite index for receiving workflow
CREATE INDEX IF NOT EXISTS idx_po_items_receiving
  ON purchase_order_items(purchase_order_id, quantity_received, quantity_sqft)
  WHERE quantity_received < quantity_sqft;

-- ADD table and column comments
COMMENT ON TABLE purchase_order_items IS 'Line items for purchase orders with material specifications';
COMMENT ON COLUMN purchase_order_items.id IS 'Unique identifier for the PO line item';
COMMENT ON COLUMN purchase_order_items.purchase_order_id IS 'Foreign key to purchase_orders table';
COMMENT ON COLUMN purchase_order_items.material_type_id IS 'Foreign key to material_types table';
COMMENT ON COLUMN purchase_order_items.line_number IS 'Sequential line number within the PO';
COMMENT ON COLUMN purchase_order_items.description IS 'Detailed description of the material being ordered';
COMMENT ON COLUMN purchase_order_items.width IS 'Requested width in inches (NULL for standard roll width)';
COMMENT ON COLUMN purchase_order_items.length IS 'Requested length in inches (NULL for standard roll length)';
COMMENT ON COLUMN purchase_order_items.thickness IS 'Requested thickness in inches (NULL for standard thickness)';
COMMENT ON COLUMN purchase_order_items.color IS 'Requested color specification';
COMMENT ON COLUMN purchase_order_items.quantity_sqft IS 'Quantity ordered in square feet';
COMMENT ON COLUMN purchase_order_items.unit_cost IS 'Cost per square foot for this line item';
COMMENT ON COLUMN purchase_order_items.line_total IS 'Total cost for this line item (quantity * unit_cost)';
COMMENT ON COLUMN purchase_order_items.quantity_received IS 'Quantity actually received (for partial deliveries)';
COMMENT ON COLUMN purchase_order_items.received_date IS 'Date when this line item was received';
COMMENT ON COLUMN purchase_order_items.created_at IS 'Timestamp when record was created';
COMMENT ON COLUMN purchase_order_items.updated_at IS 'Timestamp when record was last updated';

-- CREATE function to calculate line total automatically
CREATE OR REPLACE FUNCTION calculate_po_item_line_total()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate line total
  NEW.line_total := ROUND(NEW.quantity_sqft * NEW.unit_cost, 2);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- CREATE trigger to automatically calculate line total
CREATE TRIGGER trigger_calculate_po_item_line_total
  BEFORE INSERT OR UPDATE OF quantity_sqft, unit_cost ON purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION calculate_po_item_line_total();

-- CREATE function to update PO totals when line items change
CREATE OR REPLACE FUNCTION update_purchase_order_totals()
RETURNS TRIGGER AS $$
DECLARE
  po_id UUID;
  new_subtotal DECIMAL(12,2);
BEGIN
  -- Determine which PO to update
  IF TG_OP = 'DELETE' THEN
    po_id := OLD.purchase_order_id;
  ELSE
    po_id := NEW.purchase_order_id;
  END IF;

  -- Calculate new subtotal
  SELECT COALESCE(SUM(line_total), 0)
  INTO new_subtotal
  FROM purchase_order_items
  WHERE purchase_order_id = po_id;

  -- Update PO subtotal and total (assuming total = subtotal + tax + shipping)
  UPDATE purchase_orders
  SET subtotal = new_subtotal,
      total_amount = new_subtotal + COALESCE(tax_amount, 0) + COALESCE(shipping_cost, 0),
      updated_at = NOW()
  WHERE id = po_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- CREATE trigger to automatically update PO totals
CREATE TRIGGER trigger_update_purchase_order_totals
  AFTER INSERT OR UPDATE OR DELETE ON purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION update_purchase_order_totals();