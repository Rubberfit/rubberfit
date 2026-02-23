-- SUPPLIER MANAGEMENT FUNCTIONS

-- Function to update supplier rating based on performance metrics
CREATE OR REPLACE FUNCTION update_supplier_rating(supplier_uuid UUID)
RETURNS DECIMAL(2,1) AS $$
DECLARE
  avg_delivery_performance DECIMAL(5,2);
  total_orders INTEGER;
  on_time_deliveries INTEGER;
  new_rating DECIMAL(2,1);
BEGIN
  -- Calculate delivery performance
  SELECT
    COUNT(*),
    COUNT(CASE WHEN actual_delivery_date <= requested_delivery_date THEN 1 END)
  INTO total_orders, on_time_deliveries
  FROM purchase_orders
  WHERE supplier_id = supplier_uuid
    AND status = 'received'
    AND actual_delivery_date IS NOT NULL
    AND requested_delivery_date IS NOT NULL
    AND order_date >= CURRENT_DATE - INTERVAL '12 months';

  -- Calculate rating based on delivery performance
  IF total_orders = 0 THEN
    new_rating := 3.0; -- Default rating for new suppliers
  ELSE
    avg_delivery_performance := (on_time_deliveries::DECIMAL / total_orders) * 100;

    -- Rating scale:
    -- 95-100%: 5.0 stars
    -- 85-94%:  4.0 stars
    -- 75-84%:  3.0 stars
    -- 65-74%:  2.0 stars
    -- <65%:    1.0 stars

    CASE
      WHEN avg_delivery_performance >= 95 THEN new_rating := 5.0;
      WHEN avg_delivery_performance >= 85 THEN new_rating := 4.0;
      WHEN avg_delivery_performance >= 75 THEN new_rating := 3.0;
      WHEN avg_delivery_performance >= 65 THEN new_rating := 2.0;
      ELSE new_rating := 1.0;
    END CASE;
  END IF;

  -- Update supplier rating
  UPDATE suppliers
  SET rating = new_rating,
      updated_at = NOW()
  WHERE id = supplier_uuid;

  RETURN new_rating;
END;
$$ LANGUAGE plpgsql;

-- INVENTORY MONITORING FUNCTIONS

-- Function to check reorder points and trigger alerts
CREATE OR REPLACE FUNCTION check_reorder_points()
RETURNS TABLE(
  material_type_id UUID,
  material_name VARCHAR(100),
  current_stock DECIMAL(10,2),
  reorder_point DECIMAL(10,2),
  reorder_quantity DECIMAL(10,2),
  should_reorder BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH current_inventory AS (
    -- Calculate current stock for each material type
    SELECT
      r.material_type_id,
      mt.name as material_name,
      COALESCE(SUM(
        CASE
          WHEN r.status = 'active'
          THEN (r.remaining_length * r.width) / 144.0  -- Convert to square feet
          ELSE 0
        END
      ), 0) as current_stock_sqft
    FROM rolls r
    JOIN material_types mt ON r.material_type_id = mt.id
    GROUP BY r.material_type_id, mt.name
  ),
  reorder_evaluation AS (
    SELECT
      ci.material_type_id,
      ci.material_name,
      ci.current_stock_sqft,
      rr.reorder_point,
      rr.reorder_quantity,
      (ci.current_stock_sqft <= rr.reorder_point) as should_reorder
    FROM current_inventory ci
    JOIN reorder_rules rr ON ci.material_type_id = rr.material_type_id
    WHERE rr.active = true
  )
  SELECT
    re.material_type_id,
    re.material_name,
    re.current_stock_sqft,
    re.reorder_point,
    re.reorder_quantity,
    re.should_reorder
  FROM reorder_evaluation re
  WHERE re.should_reorder = true
  ORDER BY (re.current_stock_sqft / NULLIF(re.reorder_point, 0)) ASC; -- Most urgent first
END;
$$ LANGUAGE plpgsql;

-- Function to automatically create purchase orders from reorder rules
CREATE OR REPLACE FUNCTION auto_create_purchase_order(
  p_material_type_id UUID,
  p_reorder_rule_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_supplier_id UUID;
  v_material_supplier_rec RECORD;
  v_po_id UUID;
  v_po_number TEXT;
  v_reorder_qty DECIMAL(10,2);
  v_unit_cost DECIMAL(10,4);
BEGIN
  -- Get reorder quantity and preferred supplier
  SELECT rr.reorder_quantity, rr.supplier_id
  INTO v_reorder_qty, v_supplier_id
  FROM reorder_rules rr
  WHERE rr.id = p_reorder_rule_id AND rr.active = true;

  IF v_reorder_qty IS NULL THEN
    RAISE EXCEPTION 'Reorder rule not found or inactive: %', p_reorder_rule_id;
  END IF;

  -- Find best supplier if none specified in reorder rule
  IF v_supplier_id IS NULL THEN
    SELECT ms.supplier_id, ms.cost_per_sqft
    INTO v_supplier_id, v_unit_cost
    FROM material_suppliers ms
    JOIN suppliers s ON ms.supplier_id = s.id
    WHERE ms.material_type_id = p_material_type_id
      AND ms.active = true
      AND s.active = true
      AND ms.effective_date <= CURRENT_DATE
      AND (ms.expiration_date IS NULL OR ms.expiration_date > CURRENT_DATE)
    ORDER BY ms.preferred_supplier DESC, s.preferred DESC, ms.cost_per_sqft ASC
    LIMIT 1;
  ELSE
    -- Get cost for specified supplier
    SELECT ms.cost_per_sqft
    INTO v_unit_cost
    FROM material_suppliers ms
    WHERE ms.material_type_id = p_material_type_id
      AND ms.supplier_id = v_supplier_id
      AND ms.active = true
      AND ms.effective_date <= CURRENT_DATE
      AND (ms.expiration_date IS NULL OR ms.expiration_date > CURRENT_DATE);
  END IF;

  IF v_supplier_id IS NULL OR v_unit_cost IS NULL THEN
    RAISE EXCEPTION 'No active supplier found for material type: %', p_material_type_id;
  END IF;

  -- Generate PO number
  v_po_number := generate_po_number();

  -- Create purchase order
  INSERT INTO purchase_orders (
    po_number,
    supplier_id,
    status,
    subtotal,
    total_amount,
    auto_generated,
    reorder_rule_id,
    created_by
  ) VALUES (
    v_po_number,
    v_supplier_id,
    'draft',
    ROUND(v_reorder_qty * v_unit_cost, 2),
    ROUND(v_reorder_qty * v_unit_cost, 2),
    true,
    p_reorder_rule_id,
    'auto-reorder-system'
  ) RETURNING id INTO v_po_id;

  -- Create PO line item
  INSERT INTO purchase_order_items (
    purchase_order_id,
    material_type_id,
    line_number,
    description,
    quantity_sqft,
    unit_cost
  )
  SELECT
    v_po_id,
    p_material_type_id,
    1,
    'Auto-reorder: ' || mt.name || COALESCE(' - ' || mt.description, ''),
    v_reorder_qty,
    v_unit_cost
  FROM material_types mt
  WHERE mt.id = p_material_type_id;

  -- Update reorder rule last triggered timestamp
  UPDATE reorder_rules
  SET last_triggered_at = NOW(),
      updated_at = NOW()
  WHERE id = p_reorder_rule_id;

  RETURN v_po_id;
END;
$$ LANGUAGE plpgsql;

-- NOTIFICATION SYSTEM FUNCTIONS

-- Function to queue notifications with user preference filtering
CREATE OR REPLACE FUNCTION queue_notification(
  p_notification_type VARCHAR(50),
  p_title VARCHAR(200),
  p_message TEXT,
  p_context_data JSONB DEFAULT '{}',
  p_priority VARCHAR(10) DEFAULT 'normal',
  p_target_users TEXT[] DEFAULT NULL -- NULL means all users
)
RETURNS INTEGER AS $$
DECLARE
  v_user_prefs RECORD;
  v_notifications_queued INTEGER := 0;
  v_send_email BOOLEAN;
  v_send_sms BOOLEAN;
  v_user_list TEXT[];
BEGIN
  -- Determine target users
  IF p_target_users IS NULL THEN
    -- Get all active users
    SELECT ARRAY_AGG(user_identifier)
    INTO v_user_list
    FROM notification_preferences
    WHERE active = true;
  ELSE
    v_user_list := p_target_users;
  END IF;

  -- Loop through users and check preferences
  FOR v_user_prefs IN
    SELECT *
    FROM notification_preferences
    WHERE user_identifier = ANY(v_user_list)
      AND active = true
  LOOP
    -- Determine if user wants this type of notification
    v_send_email := v_user_prefs.email_enabled;
    v_send_sms := v_user_prefs.sms_enabled;

    -- Check specific notification type preferences
    CASE p_notification_type
      WHEN 'low_stock' THEN
        v_send_email := v_send_email AND v_user_prefs.low_stock_enabled;
        v_send_sms := v_send_sms AND v_user_prefs.low_stock_enabled;
      WHEN 'reorder_triggered' THEN
        v_send_email := v_send_email AND v_user_prefs.reorder_triggered_enabled;
        v_send_sms := v_send_sms AND v_user_prefs.reorder_triggered_enabled;
      WHEN 'po_created' THEN
        v_send_email := v_send_email AND v_user_prefs.po_created_enabled;
        v_send_sms := v_send_sms AND v_user_prefs.po_created_enabled;
      WHEN 'po_approved' THEN
        v_send_email := v_send_email AND v_user_prefs.po_approved_enabled;
        v_send_sms := v_send_sms AND v_user_prefs.po_approved_enabled;
      WHEN 'delivery_expected' THEN
        v_send_email := v_send_email AND v_user_prefs.delivery_expected_enabled;
        v_send_sms := v_send_sms AND v_user_prefs.delivery_expected_enabled;
      WHEN 'delivery_overdue' THEN
        v_send_email := v_send_email AND v_user_prefs.delivery_overdue_enabled;
        v_send_sms := v_send_sms AND v_user_prefs.delivery_overdue_enabled;
      WHEN 'delivery_received' THEN
        v_send_email := v_send_email AND v_user_prefs.delivery_received_enabled;
        v_send_sms := v_send_sms AND v_user_prefs.delivery_received_enabled;
      WHEN 'price_change' THEN
        v_send_email := v_send_email AND v_user_prefs.price_change_enabled;
        v_send_sms := v_send_sms AND v_user_prefs.price_change_enabled;
      WHEN 'critical_alert' THEN
        v_send_email := v_send_email AND v_user_prefs.critical_alerts_enabled;
        v_send_sms := v_send_sms AND v_user_prefs.critical_alerts_enabled;
    END CASE;

    -- Skip if user doesn't want any notifications for this type
    IF NOT (v_send_email OR v_send_sms) THEN
      CONTINUE;
    END IF;

    -- Queue the notification
    INSERT INTO notification_queue (
      user_identifier,
      notification_type,
      title,
      message,
      send_email,
      send_sms,
      priority,
      context_data
    ) VALUES (
      v_user_prefs.user_identifier,
      p_notification_type,
      p_title,
      p_message,
      v_send_email,
      v_send_sms,
      p_priority,
      p_context_data
    );

    v_notifications_queued := v_notifications_queued + 1;
  END LOOP;

  RETURN v_notifications_queued;
END;
$$ LANGUAGE plpgsql;

-- AUTOMATED TRIGGERS

-- Trigger to update supplier ratings when PO is received
CREATE OR REPLACE FUNCTION trigger_update_supplier_rating()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger when status changes to 'received'
  IF NEW.status = 'received' AND OLD.status != 'received' THEN
    PERFORM update_supplier_rating(NEW.supplier_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_po_received_update_rating
  AFTER UPDATE ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_supplier_rating();

-- Trigger to create price history when material_suppliers pricing changes
CREATE OR REPLACE FUNCTION trigger_create_price_history()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create history entry when cost changes
  IF NEW.cost_per_sqft != OLD.cost_per_sqft THEN
    INSERT INTO price_history (
      material_supplier_id,
      old_cost_per_sqft,
      new_cost_per_sqft,
      change_reason,
      effective_date,
      changed_by
    ) VALUES (
      NEW.id,
      OLD.cost_per_sqft,
      NEW.cost_per_sqft,
      'Price update',
      NEW.effective_date,
      'system'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_material_suppliers_price_change
  AFTER UPDATE ON material_suppliers
  FOR EACH ROW
  EXECUTE FUNCTION trigger_create_price_history();

-- Trigger to queue notifications for significant price changes
CREATE OR REPLACE FUNCTION trigger_price_change_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_price_change_pct DECIMAL(5,2);
  v_material_name VARCHAR(100);
  v_supplier_name VARCHAR(200);
BEGIN
  -- Calculate percentage change
  IF OLD.cost_per_sqft > 0 THEN
    v_price_change_pct := ABS((NEW.cost_per_sqft - OLD.cost_per_sqft) / OLD.cost_per_sqft) * 100;

    -- Only notify for changes > 5%
    IF v_price_change_pct >= 5.0 THEN
      -- Get material and supplier names
      SELECT mt.name INTO v_material_name
      FROM material_types mt
      WHERE mt.id = NEW.material_type_id;

      SELECT s.name INTO v_supplier_name
      FROM suppliers s
      WHERE s.id = NEW.supplier_id;

      -- Queue notification
      PERFORM queue_notification(
        'price_change',
        'Price Change Alert: ' || v_material_name,
        FORMAT('Price for %s from %s changed by %.1f%% (from $%.4f to $%.4f per sqft)',
               v_material_name,
               v_supplier_name,
               v_price_change_pct,
               OLD.cost_per_sqft,
               NEW.cost_per_sqft),
        jsonb_build_object(
          'material_type_id', NEW.material_type_id,
          'supplier_id', NEW.supplier_id,
          'old_price', OLD.cost_per_sqft,
          'new_price', NEW.cost_per_sqft,
          'change_percentage', v_price_change_pct
        ),
        'high'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_significant_price_change_notification
  AFTER UPDATE ON material_suppliers
  FOR EACH ROW
  EXECUTE FUNCTION trigger_price_change_notification();

-- MAINTENANCE FUNCTIONS

-- Function to run daily reorder checks
CREATE OR REPLACE FUNCTION daily_reorder_check()
RETURNS TABLE(
  material_name VARCHAR(100),
  current_stock DECIMAL(10,2),
  reorder_point DECIMAL(10,2),
  po_created UUID
) AS $$
DECLARE
  v_reorder_rec RECORD;
  v_po_id UUID;
BEGIN
  -- Check all materials that need reordering
  FOR v_reorder_rec IN
    SELECT * FROM check_reorder_points()
  LOOP
    -- Create PO if auto-reorder is enabled
    SELECT rr.id, rr.auto_reorder
    INTO v_reorder_rec.reorder_rule_id, v_reorder_rec.auto_reorder_enabled
    FROM reorder_rules rr
    WHERE rr.material_type_id = v_reorder_rec.material_type_id;

    v_po_id := NULL;

    IF v_reorder_rec.auto_reorder_enabled THEN
      BEGIN
        v_po_id := auto_create_purchase_order(
          v_reorder_rec.material_type_id,
          v_reorder_rec.reorder_rule_id
        );

        -- Queue notification for auto-created PO
        PERFORM queue_notification(
          'po_created',
          'Auto PO Created: ' || v_reorder_rec.material_name,
          FORMAT('Purchase order automatically created for %s. Current stock: %.2f sqft, Reorder point: %.2f sqft',
                 v_reorder_rec.material_name,
                 v_reorder_rec.current_stock,
                 v_reorder_rec.reorder_point),
          jsonb_build_object(
            'material_type_id', v_reorder_rec.material_type_id,
            'po_id', v_po_id,
            'auto_generated', true
          ),
          'normal'
        );
      EXCEPTION
        WHEN OTHERS THEN
          -- Log error and continue with next material
          RAISE NOTICE 'Failed to create auto PO for material %: %', v_reorder_rec.material_name, SQLERRM;
      END;
    ELSE
      -- Queue low stock notification
      PERFORM queue_notification(
        'low_stock',
        'Low Stock Alert: ' || v_reorder_rec.material_name,
        FORMAT('Stock level for %s has reached reorder point. Current: %.2f sqft, Reorder point: %.2f sqft',
               v_reorder_rec.material_name,
               v_reorder_rec.current_stock,
               v_reorder_rec.reorder_point),
        jsonb_build_object(
          'material_type_id', v_reorder_rec.material_type_id,
          'current_stock', v_reorder_rec.current_stock,
          'reorder_point', v_reorder_rec.reorder_point
        ),
        'high'
      );
    END IF;

    RETURN QUERY SELECT v_reorder_rec.material_name, v_reorder_rec.current_stock, v_reorder_rec.reorder_point, v_po_id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;