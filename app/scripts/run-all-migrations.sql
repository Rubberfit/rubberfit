-- RubberFit Pro - Complete Database Setup
-- Run this entire script in Supabase SQL Editor

-- 1. Create material_types table
CREATE TABLE IF NOT EXISTS material_types (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  default_cost DECIMAL(10,2),
  min_stock_alert DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create rolls table
CREATE TABLE IF NOT EXISTS rolls (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  material_type_id UUID REFERENCES material_types(id),
  material_type VARCHAR(100) NOT NULL,
  width DECIMAL(10,3) NOT NULL,
  length DECIMAL(10,3) NOT NULL,
  thickness DECIMAL(10,3) NOT NULL,
  color VARCHAR(50),
  location VARCHAR(100),
  date_received DATE DEFAULT CURRENT_DATE,
  supplier VARCHAR(200),
  cost_per_sqft DECIMAL(10,4),
  remaining_length DECIMAL(10,3) NOT NULL,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'depleted', 'reserved')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create cuts table
CREATE TABLE IF NOT EXISTS cuts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  roll_id UUID REFERENCES rolls(id) ON DELETE SET NULL,
  cut_width DECIMAL(10,3) NOT NULL,
  cut_length DECIMAL(10,3) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  waste_sqft DECIMAL(10,4),
  waste_percentage DECIMAL(5,2),
  total_sqft_used DECIMAL(10,4),
  job_reference VARCHAR(100),
  cut_by VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_rolls_material_type ON rolls(material_type);
CREATE INDEX IF NOT EXISTS idx_rolls_status ON rolls(status);
CREATE INDEX IF NOT EXISTS idx_rolls_material_status ON rolls(material_type, status);
CREATE INDEX IF NOT EXISTS idx_cuts_roll_id ON cuts(roll_id);
CREATE INDEX IF NOT EXISTS idx_cuts_created_at ON cuts(created_at);

-- 5. Enable Row Level Security
ALTER TABLE material_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE rolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow all on material_types" ON material_types;
DROP POLICY IF EXISTS "Allow all on rolls" ON rolls;
DROP POLICY IF EXISTS "Allow all on cuts" ON cuts;

-- Create policies (allow all for now, will add auth later)
CREATE POLICY "Allow all on material_types" ON material_types FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on rolls" ON rolls FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on cuts" ON cuts FOR ALL USING (true) WITH CHECK (true);

-- 6. Create auto-update triggers
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS rolls_updated_at ON rolls;
DROP TRIGGER IF EXISTS material_types_updated_at ON material_types;

-- Create new triggers
CREATE TRIGGER rolls_updated_at BEFORE UPDATE ON rolls
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER material_types_updated_at BEFORE UPDATE ON material_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 7. Seed material types
INSERT INTO material_types (name, description, default_cost, min_stock_alert) VALUES
  ('Neoprene', 'General purpose synthetic rubber, oil/weather resistant', 2.50, 100),
  ('EPDM', 'Ethylene propylene diene monomer, UV/ozone resistant', 3.00, 80),
  ('Nitrile', 'Oil and fuel resistant, common in gaskets', 2.75, 60),
  ('Silicone', 'High temperature resistance, food grade available', 5.00, 50),
  ('Natural Rubber', 'High elasticity, abrasion resistant', 2.00, 100),
  ('Viton', 'Fluoroelastomer, chemical resistant, high temp', 8.50, 30),
  ('Butyl', 'Low gas permeability, good for seals', 3.25, 50),
  ('SBR', 'Styrene-butadiene, cost effective general purpose', 1.75, 120)
ON CONFLICT (name) DO NOTHING;

-- 8. Seed sample rolls for testing
INSERT INTO rolls (material_type_id, material_type, width, length, thickness, color, location, supplier, cost_per_sqft, remaining_length, status)
SELECT
  m.id,
  m.name,
  (ARRAY[36, 48, 60, 72])[floor(random() * 4 + 1)]::DECIMAL,
  (ARRAY[100, 150, 200, 250])[floor(random() * 4 + 1)]::DECIMAL,
  (ARRAY[0.125, 0.25, 0.375, 0.5])[floor(random() * 4 + 1)]::DECIMAL,
  (ARRAY['Black', 'Red', 'Blue', 'Gray', 'White'])[floor(random() * 5 + 1)],
  'Rack ' || chr(65 + floor(random() * 5)::int) || '-' || (floor(random() * 10 + 1))::text,
  (ARRAY['Industrial Supply Co', 'Rubber Direct', 'Material Solutions Inc', 'Global Rubber Corp'])[floor(random() * 4 + 1)],
  (2 + random() * 4)::DECIMAL(10,4),
  (50 + random() * 150)::DECIMAL(10,3),
  'active'
FROM material_types m
CROSS JOIN generate_series(1, 3);

-- Add some depleted rolls for history
INSERT INTO rolls (material_type_id, material_type, width, length, thickness, color, location, supplier, cost_per_sqft, remaining_length, status)
SELECT
  m.id,
  m.name,
  48,
  150,
  0.25,
  'Black',
  'Rack B-3',
  'Industrial Supply Co',
  2.50,
  0,
  'depleted'
FROM material_types m
WHERE m.name IN ('Neoprene', 'EPDM')
LIMIT 2;

-- Add some sample cuts for history
INSERT INTO cuts (roll_id, cut_width, cut_length, quantity, waste_sqft, waste_percentage, total_sqft_used, job_reference, cut_by)
SELECT
  r.id,
  24,
  48,
  2,
  4.5,
  12.5,
  20.5,
  'JOB-' || (1000 + floor(random() * 1000))::text,
  'Operator ' || chr(65 + floor(random() * 3)::int)
FROM rolls r
WHERE r.status = 'active'
LIMIT 5;

-- Final verification query
SELECT
  'Setup Complete!' as status,
  (SELECT COUNT(*) FROM material_types) as material_types_count,
  (SELECT COUNT(*) FROM rolls WHERE status = 'active') as active_rolls_count,
  (SELECT COUNT(*) FROM cuts) as cuts_count;