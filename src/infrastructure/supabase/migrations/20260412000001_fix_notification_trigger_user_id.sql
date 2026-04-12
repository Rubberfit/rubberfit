-- ─────────────────────────────────────────────────────────────────────────────
-- Fix trigger functions that insert into notifications without user_id.
-- After 20240223000001 made notifications.user_id NOT NULL, these functions
-- started violating the constraint whenever a cut was recorded or a roll
-- was depleted.
-- ─────────────────────────────────────────────────────────────────────────────

-- update_roll_after_cut: NEW is a cuts row — use NEW.user_id
CREATE OR REPLACE FUNCTION update_roll_after_cut()
RETURNS TRIGGER AS $$
DECLARE
  roll_width DECIMAL(10,3);
  length_used DECIMAL(10,3);
BEGIN
  SELECT width INTO roll_width
  FROM rolls
  WHERE id = NEW.roll_id;

  length_used = (NEW.cut_width * NEW.cut_length * NEW.quantity) / roll_width;

  UPDATE rolls
  SET remaining_length = remaining_length - length_used
  WHERE id = NEW.roll_id;

  INSERT INTO notifications (user_id, type, title, description)
  VALUES (
    NEW.user_id,
    'cut_completed',
    'Cut Operation Completed',
    'Cut of ' || NEW.quantity || ' piece(s) at ' || NEW.cut_width || '"x' || NEW.cut_length || '" completed'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- check_roll_depletion: NEW is a rolls row — use NEW.user_id
CREATE OR REPLACE FUNCTION check_roll_depletion()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.remaining_length <= 0.001 THEN
    NEW.status = 'depleted';

    INSERT INTO notifications (user_id, type, title, description, material_type)
    VALUES (
      NEW.user_id,
      'roll_depleted',
      'Roll Depleted',
      'Roll #' || NEW.id || ' (' || NEW.material_type || ') has been fully consumed',
      NEW.material_type
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
