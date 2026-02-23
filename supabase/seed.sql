-- RubberFit Pro - Sample Test Data
-- Description: Seed data for development and testing
-- Author: RubberFit Pro Team
-- Date: 2024-02-17
-- WARNING: This contains sample data only - do not use in production

-- Insert sample material types
INSERT INTO material_types (name, description, default_cost, min_stock_alert) VALUES
  ('Neoprene', 'General purpose synthetic rubber, oil and weather resistant', 2.50, 100.0),
  ('EPDM', 'Ethylene propylene diene monomer, excellent UV and ozone resistance', 3.00, 80.0),
  ('Nitrile', 'Oil and fuel resistant, commonly used in gaskets and seals', 2.75, 60.0),
  ('Silicone', 'High temperature resistance, food grade options available', 5.00, 50.0),
  ('Natural Rubber', 'High elasticity and abrasion resistance', 2.00, 100.0),
  ('Viton', 'Fluoroelastomer, chemical resistant, extreme temperature range', 8.50, 30.0),
  ('Butyl', 'Low gas permeability, excellent for sealing applications', 3.25, 50.0),
  ('SBR', 'Styrene-butadiene rubber, cost-effective general purpose', 1.75, 120.0)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  default_cost = EXCLUDED.default_cost,
  min_stock_alert = EXCLUDED.min_stock_alert,
  updated_at = NOW();

-- Insert sample rolls for testing
INSERT INTO rolls (
  material_type_id,
  material_type,
  width,
  length,
  thickness,
  color,
  location,
  date_received,
  supplier,
  cost_per_sqft,
  remaining_length,
  status,
  notes
) VALUES
  -- Neoprene rolls
  ((SELECT id FROM material_types WHERE name = 'Neoprene'), 'Neoprene', 36.0, 1200.0, 0.125, 'Black', 'Rack A-1', '2024-01-15', 'Acme Rubber Supply', 2.45, 980.0, 'active', 'Good quality batch'),
  ((SELECT id FROM material_types WHERE name = 'Neoprene'), 'Neoprene', 48.0, 1000.0, 0.125, 'Black', 'Rack A-2', '2024-01-20', 'Acme Rubber Supply', 2.45, 1000.0, 'active', 'Fresh inventory'),
  ((SELECT id FROM material_types WHERE name = 'Neoprene'), 'Neoprene', 24.0, 800.0, 0.250, 'Gray', 'Rack A-3', '2024-02-01', 'Superior Materials', 2.60, 650.0, 'active', 'Thicker grade'),

  -- EPDM rolls
  ((SELECT id FROM material_types WHERE name = 'EPDM'), 'EPDM', 36.0, 1500.0, 0.125, 'White', 'Rack B-1', '2024-01-10', 'Industrial Polymers Inc', 2.95, 1200.0, 'active', 'UV resistant grade'),
  ((SELECT id FROM material_types WHERE name = 'EPDM'), 'EPDM', 60.0, 800.0, 0.188, 'Black', 'Rack B-2', '2024-02-05', 'Industrial Polymers Inc', 3.10, 800.0, 'active', 'Wide roll for large cuts'),

  -- Nitrile rolls
  ((SELECT id FROM material_types WHERE name = 'Nitrile'), 'Nitrile', 36.0, 1000.0, 0.125, 'Black', 'Rack C-1', '2024-01-25', 'Chemical Resistant Materials', 2.70, 450.0, 'active', 'Oil resistant grade'),
  ((SELECT id FROM material_types WHERE name = 'Nitrile'), 'Nitrile', 48.0, 600.0, 0.250, 'Blue', 'Rack C-2', '2024-02-10', 'Chemical Resistant Materials', 2.85, 150.0, 'active', 'Food grade'),

  -- Silicone rolls
  ((SELECT id FROM material_types WHERE name = 'Silicone'), 'Silicone', 24.0, 500.0, 0.125, 'Clear', 'Rack D-1', '2024-02-12', 'High Temp Solutions', 4.95, 500.0, 'active', 'Food grade clear'),
  ((SELECT id FROM material_types WHERE name = 'Silicone'), 'Silicone', 36.0, 400.0, 0.188, 'Red', 'Rack D-2', '2024-01-30', 'High Temp Solutions', 5.10, 120.0, 'active', 'High temp grade'),

  -- Natural Rubber rolls
  ((SELECT id FROM material_types WHERE name = 'Natural Rubber'), 'Natural Rubber', 48.0, 1200.0, 0.125, 'Tan', 'Rack E-1', '2024-02-08', 'Natural Materials Co', 1.95, 1100.0, 'active', 'Premium grade'),

  -- Depleted roll for testing
  ((SELECT id FROM material_types WHERE name = 'Viton'), 'Viton', 12.0, 300.0, 0.125, 'Black', 'Rack F-1', '2024-01-05', 'Specialty Fluoropolymers', 8.25, 0.0, 'depleted', 'Fully consumed'),

  -- Reserved roll for testing
  ((SELECT id FROM material_types WHERE name = 'Butyl'), 'Butyl', 36.0, 800.0, 0.125, 'Black', 'Rack G-1', '2024-02-14', 'Sealing Solutions', 3.20, 800.0, 'reserved', 'Reserved for Job #12345');

-- Insert sample cut records
-- Temporarily disabled to avoid constraint violations during initial seeding
-- These will be added after the Phase 2 migration
/*
INSERT INTO cuts (
  roll_id,
  cut_width,
  cut_length,
  quantity,
  waste_sqft,
  waste_percentage,
  total_sqft_used,
  job_reference,
  cut_by,
  notes
) VALUES
  -- Cuts from first Neoprene roll
  ((SELECT id FROM rolls WHERE material_type = 'Neoprene' AND width = 36.0 AND remaining_length = 980.0),
   24.0, 60.0, 2, 5.0, 12.5, 25.0, 'JOB-001', 'John Smith', 'Clean cuts, good quality'),

  ((SELECT id FROM rolls WHERE material_type = 'Neoprene' AND width = 36.0 AND remaining_length = 980.0),
   30.0, 48.0, 1, 2.0, 8.3, 12.0, 'JOB-002', 'Mike Johnson', 'Minimal waste'),

  -- Cuts from EPDM roll
  ((SELECT id FROM rolls WHERE material_type = 'EPDM' AND width = 36.0),
   36.0, 72.0, 3, 0.0, 0.0, 54.0, 'JOB-003', 'Sarah Wilson', 'Perfect fit, no waste'),

  -- Cuts from Nitrile roll
  ((SELECT id FROM rolls WHERE material_type = 'Nitrile' AND width = 36.0),
   18.0, 96.0, 4, 8.0, 15.0, 48.0, 'JOB-004', 'Tom Brown', 'Some edge waste due to width'),

  -- Historical cut from depleted Viton roll
  ((SELECT id FROM rolls WHERE material_type = 'Viton' AND status = 'depleted'),
   12.0, 300.0, 1, 0.0, 0.0, 25.0, 'JOB-005', 'Lisa Davis', 'Used entire roll width');
*/

-- Generate initial low stock notifications
SELECT generate_low_stock_notifications();

-- Insert some test notifications
INSERT INTO notifications (type, title, description, is_read) VALUES
  ('system_alert', 'Database Initialized', 'RubberFit Pro database has been successfully initialized with sample data', false),
  ('cut_completed', 'Large Order Completed', 'Completed cutting order for 50 gaskets from Neoprene stock', true);

-- Show summary of seeded data
DO $$
DECLARE
    material_count INT;
    roll_count INT;
    cut_count INT;
    notification_count INT;
BEGIN
    SELECT COUNT(*) INTO material_count FROM material_types;
    SELECT COUNT(*) INTO roll_count FROM rolls;
    SELECT COUNT(*) INTO cut_count FROM cuts;
    SELECT COUNT(*) INTO notification_count FROM notifications;

    RAISE NOTICE 'Database seeding completed successfully!';
    RAISE NOTICE 'Material Types: %', material_count;
    RAISE NOTICE 'Rolls: %', roll_count;
    RAISE NOTICE 'Cuts: %', cut_count;
    RAISE NOTICE 'Notifications: %', notification_count;
END $$;