CREATE reorder_rules table for automated reorder point management
CREATE TABLE IF NOT EXISTS reorder_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  material_type_id UUID NOT NULL REFERENCES material_types(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  reorder_point DECIMAL(10,2) NOT NULL CHECK (reorder_point >= 0),
  reorder_quantity DECIMAL(10,2) NOT NULL CHECK (reorder_quantity > 0),
  max_stock_level DECIMAL(10,2) CHECK (max_stock_level IS NULL OR max_stock_level >= reorder_quantity),
  lead_time_days INTEGER NOT NULL DEFAULT 7 CHECK (lead_time_days >= 0),
  safety_stock_days INTEGER DEFAULT 3 CHECK (safety_stock_days >= 0),
  auto_reorder BOOLEAN DEFAULT FALSE,
  active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_material_reorder_rule UNIQUE(material_type_id),
  CONSTRAINT valid_stock_levels CHECK (max_stock_level IS NULL OR max_stock_level > reorder_point)
);

CREATE indexes for performance
CREATE INDEX IF NOT EXISTS idx_reorder_rules_material_type ON reorder_rules(material_type_id);
CREATE INDEX IF NOT EXISTS idx_reorder_rules_supplier ON reorder_rules(supplier_id);
CREATE INDEX IF NOT EXISTS idx_reorder_rules_active ON reorder_rules(active);
CREATE INDEX IF NOT EXISTS idx_reorder_rules_auto_reorder ON reorder_rules(auto_reorder);
CREATE INDEX IF NOT EXISTS idx_reorder_rules_last_triggered ON reorder_rules(last_triggered_at);

ADD table and column comments
COMMENT ON TABLE reorder_rules IS 'Automated reorder point rules for inventory management';
COMMENT ON COLUMN reorder_rules.id IS 'Unique identifier for the reorder rule';
COMMENT ON COLUMN reorder_rules.material_type_id IS 'Foreign key to material_types table (one rule per material)';
COMMENT ON COLUMN reorder_rules.supplier_id IS 'Preferred supplier for auto-reorders (NULL = use best available)';
COMMENT ON COLUMN reorder_rules.reorder_point IS 'Inventory level that triggers reorder (square feet)';
COMMENT ON COLUMN reorder_rules.reorder_quantity IS 'Standard quantity to reorder (square feet)';
COMMENT ON COLUMN reorder_rules.max_stock_level IS 'Maximum inventory level to maintain (NULL = no limit)';
COMMENT ON COLUMN reorder_rules.lead_time_days IS 'Expected delivery time for planning purposes';
COMMENT ON COLUMN reorder_rules.safety_stock_days IS 'Additional safety buffer in days of usage';
COMMENT ON COLUMN reorder_rules.auto_reorder IS 'Whether to automatically create POs when triggered';
COMMENT ON COLUMN reorder_rules.active IS 'Whether this reorder rule is currently active';
COMMENT ON COLUMN reorder_rules.last_triggered_at IS 'Last time this rule triggered a reorder';
COMMENT ON COLUMN reorder_rules.created_at IS 'Timestamp when record was created';
COMMENT ON COLUMN reorder_rules.updated_at IS 'Timestamp when record was last updated';