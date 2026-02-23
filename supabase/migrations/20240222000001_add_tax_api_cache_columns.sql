-- Add Avalara caching columns to tax_rates table
-- This allows us to cache API-fetched tax rates and distinguish them from manual entries

ALTER TABLE tax_rates
ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'manual'
  CHECK (source IN ('manual', 'avalara', 'default')),
ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Update existing rows to be marked as 'manual' source
UPDATE tax_rates SET source = 'manual' WHERE source IS NULL;

-- Create function to upsert cached tax rates from Avalara
CREATE OR REPLACE FUNCTION upsert_cached_tax_rate(
  p_state VARCHAR(2),
  p_city VARCHAR(100),
  p_zip_code VARCHAR(20),
  p_tax_rate DECIMAL(5,4),
  p_tax_name VARCHAR(100),
  p_expires_at TIMESTAMPTZ
) RETURNS void AS $$
BEGIN
  -- Try to update existing record first
  UPDATE tax_rates
  SET tax_rate = p_tax_rate,
      tax_name = p_tax_name,
      source = 'avalara',
      fetched_at = NOW(),
      expires_at = p_expires_at,
      updated_at = NOW()
  WHERE state = p_state
    AND ((city IS NULL AND p_city IS NULL) OR city = p_city)
    AND ((zip_code IS NULL AND p_zip_code IS NULL) OR zip_code = p_zip_code)
    AND is_active = TRUE;

  -- If no row updated, insert a new one
  IF NOT FOUND THEN
    INSERT INTO tax_rates (state, city, zip_code, tax_rate, tax_name, source, fetched_at, expires_at, is_active)
    VALUES (p_state, p_city, p_zip_code, p_tax_rate, p_tax_name, 'avalara', NOW(), p_expires_at, TRUE);
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION upsert_cached_tax_rate IS 'Inserts or updates a cached tax rate from the Avalara API';

-- Update get_tax_rate_details to also return source and expires_at
CREATE OR REPLACE FUNCTION get_tax_rate_details(
  p_state VARCHAR(2),
  p_city VARCHAR(100) DEFAULT NULL,
  p_zip_code VARCHAR(20) DEFAULT NULL
) RETURNS TABLE(
  tax_rate DECIMAL(5,4),
  tax_name VARCHAR(100),
  tax_level VARCHAR(20),
  source VARCHAR(20),
  expires_at TIMESTAMPTZ
) AS $$
BEGIN
  -- First try to find exact match with zip code
  IF p_zip_code IS NOT NULL THEN
    RETURN QUERY
    SELECT tr.tax_rate, tr.tax_name, 'zip_code'::VARCHAR(20) as tax_level,
           COALESCE(tr.source, 'manual')::VARCHAR(20) as source, tr.expires_at
    FROM tax_rates tr
    WHERE tr.state = p_state
      AND tr.zip_code = p_zip_code
      AND tr.is_active = TRUE
    LIMIT 1;

    IF FOUND THEN
      RETURN;
    END IF;
  END IF;

  -- Then try city-level tax
  IF p_city IS NOT NULL THEN
    RETURN QUERY
    SELECT tr.tax_rate, tr.tax_name, 'city'::VARCHAR(20) as tax_level,
           COALESCE(tr.source, 'manual')::VARCHAR(20) as source, tr.expires_at
    FROM tax_rates tr
    WHERE tr.state = p_state
      AND tr.city = p_city
      AND tr.zip_code IS NULL
      AND tr.is_active = TRUE
    LIMIT 1;

    IF FOUND THEN
      RETURN;
    END IF;
  END IF;

  -- Finally fall back to state-level tax
  RETURN QUERY
  SELECT tr.tax_rate, tr.tax_name, 'state'::VARCHAR(20) as tax_level,
         COALESCE(tr.source, 'manual')::VARCHAR(20) as source, tr.expires_at
  FROM tax_rates tr
  WHERE tr.state = p_state
    AND tr.city IS NULL
    AND tr.zip_code IS NULL
    AND tr.is_active = TRUE
  LIMIT 1;

  -- If no tax rate found, return default
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT 0.08::DECIMAL(5,4), 'Default Tax Rate'::VARCHAR(100), 'default'::VARCHAR(20),
           'default'::VARCHAR(20), NULL::TIMESTAMPTZ;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_tax_rate_details IS 'Returns the applicable tax rate, name, level, source, and expiry for a given location';

-- Create index for faster expiry lookups
CREATE INDEX IF NOT EXISTS idx_tax_rates_expires ON tax_rates(expires_at) WHERE source = 'avalara' AND is_active = TRUE;