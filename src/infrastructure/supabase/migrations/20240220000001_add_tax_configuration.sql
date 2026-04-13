-- Add tax configuration to suppliers table
ALTER TABLE suppliers
ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5,4) DEFAULT 0.08 CHECK (tax_rate >= 0 AND tax_rate <= 1),
ADD COLUMN IF NOT EXISTS tax_exempt BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS state VARCHAR(2),
ADD COLUMN IF NOT EXISTS city VARCHAR(100),
ADD COLUMN IF NOT EXISTS zip_code VARCHAR(20);

-- Add shipping configuration to suppliers
ALTER TABLE suppliers
ADD COLUMN IF NOT EXISTS default_shipping_cost DECIMAL(10,2) DEFAULT 50.00,
ADD COLUMN IF NOT EXISTS shipping_calculation_type VARCHAR(20) DEFAULT 'flat'
  CHECK (shipping_calculation_type IN ('flat', 'weight', 'percentage', 'custom'));

-- Create tax rates table for location-based tax lookup
CREATE TABLE IF NOT EXISTS tax_rates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  state VARCHAR(2) NOT NULL,
  city VARCHAR(100),
  zip_code VARCHAR(20),
  tax_rate DECIMAL(5,4) NOT NULL CHECK (tax_rate >= 0 AND tax_rate <= 1),
  tax_name VARCHAR(100), -- e.g., "Texas State Tax", "Austin City Tax"
  effective_date DATE DEFAULT CURRENT_DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Create unique constraint for location
  CONSTRAINT unique_active_tax_rate UNIQUE (state, city, zip_code, is_active)
);

-- Create index for fast lookups
CREATE INDEX idx_tax_rates_location ON tax_rates(state, city, zip_code) WHERE is_active = TRUE;
CREATE INDEX idx_tax_rates_state ON tax_rates(state) WHERE is_active = TRUE;

-- Insert common US state tax rates (as defaults)
INSERT INTO tax_rates (state, tax_rate, tax_name) VALUES
  ('TX', 0.0625, 'Texas State Tax'),
  ('CA', 0.0725, 'California State Tax'),
  ('NY', 0.04, 'New York State Tax'),
  ('FL', 0.06, 'Florida State Tax'),
  ('WA', 0.065, 'Washington State Tax'),
  ('NV', 0.0685, 'Nevada State Tax'),
  ('OR', 0.0, 'Oregon State Tax'), -- No sales tax
  ('MT', 0.0, 'Montana State Tax'), -- No sales tax
  ('NH', 0.0, 'New Hampshire State Tax'), -- No sales tax
  ('DE', 0.0, 'Delaware State Tax'), -- No sales tax
  ('AK', 0.0, 'Alaska State Tax') -- No state sales tax
ON CONFLICT DO NOTHING;

-- Add some Texas cities with additional local taxes
INSERT INTO tax_rates (state, city, tax_rate, tax_name) VALUES
  ('TX', 'Austin', 0.0825, 'Austin Combined Tax'),
  ('TX', 'Houston', 0.0825, 'Houston Combined Tax'),
  ('TX', 'Dallas', 0.0825, 'Dallas Combined Tax'),
  ('TX', 'San Antonio', 0.0825, 'San Antonio Combined Tax')
ON CONFLICT DO NOTHING;

-- Create function to calculate tax rate based on location
CREATE OR REPLACE FUNCTION get_tax_rate_for_location(
  p_state VARCHAR(2),
  p_city VARCHAR(100) DEFAULT NULL,
  p_zip_code VARCHAR(20) DEFAULT NULL
) RETURNS DECIMAL(5,4) AS $$
DECLARE
  v_tax_rate DECIMAL(5,4);
BEGIN
  -- First try to find exact match with zip code
  IF p_zip_code IS NOT NULL THEN
    SELECT tax_rate INTO v_tax_rate
    FROM tax_rates
    WHERE state = p_state
      AND city = p_city
      AND zip_code = p_zip_code
      AND is_active = TRUE
    LIMIT 1;

    IF v_tax_rate IS NOT NULL THEN
      RETURN v_tax_rate;
    END IF;
  END IF;

  -- Then try city-level tax
  IF p_city IS NOT NULL THEN
    SELECT tax_rate INTO v_tax_rate
    FROM tax_rates
    WHERE state = p_state
      AND city = p_city
      AND zip_code IS NULL
      AND is_active = TRUE
    LIMIT 1;

    IF v_tax_rate IS NOT NULL THEN
      RETURN v_tax_rate;
    END IF;
  END IF;

  -- Finally fall back to state-level tax
  SELECT tax_rate INTO v_tax_rate
  FROM tax_rates
  WHERE state = p_state
    AND city IS NULL
    AND zip_code IS NULL
    AND is_active = TRUE
  LIMIT 1;

  -- If no tax rate found, return default 8%
  RETURN COALESCE(v_tax_rate, 0.08);
END;
$$ LANGUAGE plpgsql;

-- Add comment
COMMENT ON FUNCTION get_tax_rate_for_location IS 'Returns the applicable tax rate for a given location, checking zip, then city, then state level';
COMMENT ON COLUMN suppliers.tax_rate IS 'Override tax rate for this supplier (0-1, e.g., 0.08 = 8%)';
COMMENT ON COLUMN suppliers.tax_exempt IS 'Whether this supplier is tax exempt';
COMMENT ON COLUMN suppliers.state IS 'Supplier state for tax calculation';
COMMENT ON COLUMN suppliers.city IS 'Supplier city for tax calculation';
COMMENT ON COLUMN suppliers.zip_code IS 'Supplier zip code for precise tax calculation';
COMMENT ON COLUMN suppliers.default_shipping_cost IS 'Default shipping cost for this supplier';
COMMENT ON COLUMN suppliers.shipping_calculation_type IS 'How shipping is calculated: flat, weight, percentage, custom';