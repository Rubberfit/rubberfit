-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic updated_at timestamp updates
DROP TRIGGER IF EXISTS material_types_updated_at ON material_types;
CREATE TRIGGER material_types_updated_at
  BEFORE UPDATE ON material_types
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS rolls_updated_at ON rolls;
CREATE TRIGGER rolls_updated_at
  BEFORE UPDATE ON rolls
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS notifications_updated_at ON notifications;
CREATE TRIGGER notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Create function to calculate stock levels by material type
CREATE OR REPLACE FUNCTION calculate_material_stock(material_name TEXT)
RETURNS DECIMAL(10,2) AS $$
DECLARE
  total_stock DECIMAL(10,2);
BEGIN
  SELECT COALESCE(SUM((remaining_length * width) / 144), 0)
  INTO total_stock
  FROM rolls
  WHERE material_type = material_name
    AND status = 'active';

  RETURN total_stock;
END;
$$ LANGUAGE plpgsql;

-- Create function to generate low stock notifications
CREATE OR REPLACE FUNCTION generate_low_stock_notifications()
RETURNS void AS $$
DECLARE
  material RECORD;
BEGIN
  -- Clear existing low stock notifications
  DELETE FROM notifications WHERE type = 'low_stock';

  -- Generate new notifications for materials below threshold
  FOR material IN
    SELECT
      mt.name as material_type,
      mt.min_stock_alert as threshold,
      calculate_material_stock(mt.name) as current_stock
    FROM material_types mt
    WHERE calculate_material_stock(mt.name) < mt.min_stock_alert
      AND mt.min_stock_alert > 0
  LOOP
    INSERT INTO notifications (type, title, description, material_type, current_value, threshold_value)
    VALUES (
      'low_stock',
      material.material_type || ' Low Stock Alert',
      'Current stock (' || ROUND(material.current_stock, 1) || ' sqft) is below threshold (' || material.threshold || ' sqft)',
      material.material_type,
      material.current_stock,
      material.threshold
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Create function to update roll status when depleted
CREATE OR REPLACE FUNCTION check_roll_depletion()
RETURNS TRIGGER AS $$
BEGIN
  -- If remaining length is effectively zero, mark as depleted
  IF NEW.remaining_length <= 0.001 THEN
    NEW.status = 'depleted';

    -- Create notification for depleted roll
    INSERT INTO notifications (type, title, description, material_type)
    VALUES (
      'roll_depleted',
      'Roll Depleted',
      'Roll #' || NEW.id || ' (' || NEW.material_type || ') has been fully consumed',
      NEW.material_type
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically mark rolls as depleted
DROP TRIGGER IF EXISTS rolls_check_depletion ON rolls;
CREATE TRIGGER rolls_check_depletion
  BEFORE UPDATE ON rolls
  FOR EACH ROW
  WHEN (NEW.remaining_length IS DISTINCT FROM OLD.remaining_length)
  EXECUTE FUNCTION check_roll_depletion();

-- Create function to automatically update roll remaining length when cuts are made
CREATE OR REPLACE FUNCTION update_roll_after_cut()
RETURNS TRIGGER AS $$
DECLARE
  roll_width DECIMAL(10,3);
  length_used DECIMAL(10,3);
BEGIN
  -- Get the roll width
  SELECT width INTO roll_width
  FROM rolls
  WHERE id = NEW.roll_id;

  -- Calculate length used (accounting for full width usage)
  length_used = (NEW.cut_width * NEW.cut_length * NEW.quantity) / roll_width;

  -- Update the roll's remaining length
  UPDATE rolls
  SET remaining_length = remaining_length - length_used
  WHERE id = NEW.roll_id;

  -- Generate cut completed notification
  INSERT INTO notifications (type, title, description)
  VALUES (
    'cut_completed',
    'Cut Operation Completed',
    'Cut of ' || NEW.quantity || ' piece(s) at ' || NEW.cut_width || '"x' || NEW.cut_length || '" completed'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update rolls when cuts are recorded
DROP TRIGGER IF EXISTS cuts_update_roll ON cuts;
CREATE TRIGGER cuts_update_roll
  AFTER INSERT ON cuts
  FOR EACH ROW
  WHEN (NEW.roll_id IS NOT NULL)
  EXECUTE FUNCTION update_roll_after_cut();

-- Add function comments
COMMENT ON FUNCTION update_updated_at() IS 'Automatically updates the updated_at timestamp for any record';
COMMENT ON FUNCTION calculate_material_stock(TEXT) IS 'Calculates total available stock in square feet for a given material type';
COMMENT ON FUNCTION generate_low_stock_notifications() IS 'Generates notifications for materials below minimum stock threshold';
COMMENT ON FUNCTION check_roll_depletion() IS 'Automatically marks rolls as depleted when remaining length reaches zero';
COMMENT ON FUNCTION update_roll_after_cut() IS 'Updates roll remaining length and creates notifications when cuts are recorded';