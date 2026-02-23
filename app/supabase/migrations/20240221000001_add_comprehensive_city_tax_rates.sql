-- Add comprehensive city and county tax rates for major US cities
-- This migration extends the tax_rates table with detailed location-based tax rates

-- California cities with local taxes
INSERT INTO tax_rates (state, city, tax_rate, tax_name) VALUES
  ('CA', 'Los Angeles', 0.0950, 'Los Angeles Combined Tax'),
  ('CA', 'San Francisco', 0.0863, 'San Francisco Combined Tax'),
  ('CA', 'San Diego', 0.0775, 'San Diego Combined Tax'),
  ('CA', 'San Jose', 0.0913, 'San Jose Combined Tax'),
  ('CA', 'Sacramento', 0.0875, 'Sacramento Combined Tax'),
  ('CA', 'Oakland', 0.1025, 'Oakland Combined Tax'),
  ('CA', 'Long Beach', 0.1025, 'Long Beach Combined Tax'),
  ('CA', 'Fresno', 0.0798, 'Fresno Combined Tax')
ON CONFLICT DO NOTHING;

-- New York cities with local taxes
INSERT INTO tax_rates (state, city, tax_rate, tax_name) VALUES
  ('NY', 'New York City', 0.0850, 'New York City Combined Tax'),
  ('NY', 'Buffalo', 0.0800, 'Buffalo Combined Tax'),
  ('NY', 'Rochester', 0.0800, 'Rochester Combined Tax'),
  ('NY', 'Yonkers', 0.0875, 'Yonkers Combined Tax'),
  ('NY', 'Syracuse', 0.0800, 'Syracuse Combined Tax'),
  ('NY', 'Albany', 0.0800, 'Albany Combined Tax')
ON CONFLICT DO NOTHING;

-- Illinois cities with local taxes
INSERT INTO tax_rates (state, city, tax_rate, tax_name) VALUES
  ('IL', 'Chicago', 0.1025, 'Chicago Combined Tax'),
  ('IL', 'Aurora', 0.0875, 'Aurora Combined Tax'),
  ('IL', 'Rockford', 0.0875, 'Rockford Combined Tax'),
  ('IL', 'Joliet', 0.0875, 'Joliet Combined Tax'),
  ('IL', 'Naperville', 0.0750, 'Naperville Combined Tax'),
  ('IL', 'Springfield', 0.0825, 'Springfield Combined Tax')
ON CONFLICT DO NOTHING;

-- Washington cities with local taxes
INSERT INTO tax_rates (state, city, tax_rate, tax_name) VALUES
  ('WA', 'Seattle', 0.1015, 'Seattle Combined Tax'),
  ('WA', 'Spokane', 0.0890, 'Spokane Combined Tax'),
  ('WA', 'Tacoma', 0.1020, 'Tacoma Combined Tax'),
  ('WA', 'Vancouver', 0.0840, 'Vancouver Combined Tax'),
  ('WA', 'Bellevue', 0.1000, 'Bellevue Combined Tax'),
  ('WA', 'Everett', 0.1010, 'Everett Combined Tax')
ON CONFLICT DO NOTHING;

-- Arizona cities with local taxes
INSERT INTO tax_rates (state, city, tax_rate, tax_name) VALUES
  ('AZ', 'Phoenix', 0.0840, 'Phoenix Combined Tax'),
  ('AZ', 'Tucson', 0.0870, 'Tucson Combined Tax'),
  ('AZ', 'Mesa', 0.0875, 'Mesa Combined Tax'),
  ('AZ', 'Chandler', 0.0800, 'Chandler Combined Tax'),
  ('AZ', 'Scottsdale', 0.0905, 'Scottsdale Combined Tax'),
  ('AZ', 'Glendale', 0.0920, 'Glendale Combined Tax')
ON CONFLICT DO NOTHING;

-- Nevada cities with local taxes
INSERT INTO tax_rates (state, city, tax_rate, tax_name) VALUES
  ('NV', 'Las Vegas', 0.0825, 'Las Vegas Combined Tax'),
  ('NV', 'Henderson', 0.0825, 'Henderson Combined Tax'),
  ('NV', 'Reno', 0.0825, 'Reno Combined Tax'),
  ('NV', 'North Las Vegas', 0.0825, 'North Las Vegas Combined Tax'),
  ('NV', 'Sparks', 0.0825, 'Sparks Combined Tax')
ON CONFLICT DO NOTHING;

-- Colorado cities with local taxes
INSERT INTO tax_rates (state, city, tax_rate, tax_name) VALUES
  ('CO', 'Denver', 0.0881, 'Denver Combined Tax'),
  ('CO', 'Colorado Springs', 0.0825, 'Colorado Springs Combined Tax'),
  ('CO', 'Aurora', 0.0875, 'Aurora Combined Tax'),
  ('CO', 'Fort Collins', 0.0775, 'Fort Collins Combined Tax'),
  ('CO', 'Lakewood', 0.0800, 'Lakewood Combined Tax'),
  ('CO', 'Thornton', 0.0875, 'Thornton Combined Tax')
ON CONFLICT DO NOTHING;

-- Pennsylvania cities with local taxes
INSERT INTO tax_rates (state, city, tax_rate, tax_name) VALUES
  ('PA', 'Philadelphia', 0.0800, 'Philadelphia Combined Tax'),
  ('PA', 'Pittsburgh', 0.0700, 'Pittsburgh Combined Tax'),
  ('PA', 'Allentown', 0.0600, 'Allentown Combined Tax'),
  ('PA', 'Erie', 0.0600, 'Erie Combined Tax'),
  ('PA', 'Reading', 0.0600, 'Reading Combined Tax'),
  ('PA', 'Scranton', 0.0600, 'Scranton Combined Tax')
ON CONFLICT DO NOTHING;

-- Ohio cities with local taxes
INSERT INTO tax_rates (state, city, tax_rate, tax_name) VALUES
  ('OH', 'Columbus', 0.0775, 'Columbus Combined Tax'),
  ('OH', 'Cleveland', 0.0800, 'Cleveland Combined Tax'),
  ('OH', 'Cincinnati', 0.0700, 'Cincinnati Combined Tax'),
  ('OH', 'Toledo', 0.0775, 'Toledo Combined Tax'),
  ('OH', 'Akron', 0.0675, 'Akron Combined Tax'),
  ('OH', 'Dayton', 0.0775, 'Dayton Combined Tax')
ON CONFLICT DO NOTHING;

-- Michigan cities with local taxes
INSERT INTO tax_rates (state, city, tax_rate, tax_name) VALUES
  ('MI', 'Detroit', 0.0600, 'Detroit Combined Tax'),
  ('MI', 'Grand Rapids', 0.0600, 'Grand Rapids Combined Tax'),
  ('MI', 'Warren', 0.0600, 'Warren Combined Tax'),
  ('MI', 'Sterling Heights', 0.0600, 'Sterling Heights Combined Tax'),
  ('MI', 'Ann Arbor', 0.0600, 'Ann Arbor Combined Tax'),
  ('MI', 'Lansing', 0.0600, 'Lansing Combined Tax')
ON CONFLICT DO NOTHING;

-- Georgia cities with local taxes
INSERT INTO tax_rates (state, city, tax_rate, tax_name) VALUES
  ('GA', 'Atlanta', 0.0890, 'Atlanta Combined Tax'),
  ('GA', 'Augusta', 0.0800, 'Augusta Combined Tax'),
  ('GA', 'Columbus', 0.0800, 'Columbus Combined Tax'),
  ('GA', 'Macon', 0.0800, 'Macon Combined Tax'),
  ('GA', 'Savannah', 0.0700, 'Savannah Combined Tax'),
  ('GA', 'Athens', 0.0800, 'Athens Combined Tax')
ON CONFLICT DO NOTHING;

-- North Carolina cities with local taxes
INSERT INTO tax_rates (state, city, tax_rate, tax_name) VALUES
  ('NC', 'Charlotte', 0.0775, 'Charlotte Combined Tax'),
  ('NC', 'Raleigh', 0.0750, 'Raleigh Combined Tax'),
  ('NC', 'Greensboro', 0.0675, 'Greensboro Combined Tax'),
  ('NC', 'Durham', 0.0775, 'Durham Combined Tax'),
  ('NC', 'Winston-Salem', 0.0675, 'Winston-Salem Combined Tax'),
  ('NC', 'Fayetteville', 0.0675, 'Fayetteville Combined Tax')
ON CONFLICT DO NOTHING;

-- Tennessee cities with local taxes
INSERT INTO tax_rates (state, city, tax_rate, tax_name) VALUES
  ('TN', 'Nashville', 0.0925, 'Nashville Combined Tax'),
  ('TN', 'Memphis', 0.0975, 'Memphis Combined Tax'),
  ('TN', 'Knoxville', 0.0925, 'Knoxville Combined Tax'),
  ('TN', 'Chattanooga', 0.0925, 'Chattanooga Combined Tax'),
  ('TN', 'Clarksville', 0.0950, 'Clarksville Combined Tax'),
  ('TN', 'Murfreesboro', 0.0975, 'Murfreesboro Combined Tax')
ON CONFLICT DO NOTHING;

-- Louisiana cities with local taxes
INSERT INTO tax_rates (state, city, tax_rate, tax_name) VALUES
  ('LA', 'New Orleans', 0.0945, 'New Orleans Combined Tax'),
  ('LA', 'Baton Rouge', 0.1000, 'Baton Rouge Combined Tax'),
  ('LA', 'Shreveport', 0.0945, 'Shreveport Combined Tax'),
  ('LA', 'Lafayette', 0.0845, 'Lafayette Combined Tax'),
  ('LA', 'Lake Charles', 0.1025, 'Lake Charles Combined Tax'),
  ('LA', 'Kenner', 0.0995, 'Kenner Combined Tax')
ON CONFLICT DO NOTHING;

-- Virginia cities with local taxes
INSERT INTO tax_rates (state, city, tax_rate, tax_name) VALUES
  ('VA', 'Virginia Beach', 0.0600, 'Virginia Beach Combined Tax'),
  ('VA', 'Norfolk', 0.0600, 'Norfolk Combined Tax'),
  ('VA', 'Chesapeake', 0.0600, 'Chesapeake Combined Tax'),
  ('VA', 'Richmond', 0.0600, 'Richmond Combined Tax'),
  ('VA', 'Newport News', 0.0600, 'Newport News Combined Tax'),
  ('VA', 'Alexandria', 0.0600, 'Alexandria Combined Tax')
ON CONFLICT DO NOTHING;

-- Missouri cities with local taxes
INSERT INTO tax_rates (state, city, tax_rate, tax_name) VALUES
  ('MO', 'Kansas City', 0.0985, 'Kansas City Combined Tax'),
  ('MO', 'St. Louis', 0.1013, 'St. Louis Combined Tax'),
  ('MO', 'Springfield', 0.0889, 'Springfield Combined Tax'),
  ('MO', 'Independence', 0.0850, 'Independence Combined Tax'),
  ('MO', 'Columbia', 0.0798, 'Columbia Combined Tax'),
  ('MO', 'Lee\'s Summit', 0.0853, 'Lee\'s Summit Combined Tax')
ON CONFLICT DO NOTHING;

-- Oklahoma cities with local taxes
INSERT INTO tax_rates (state, city, tax_rate, tax_name) VALUES
  ('OK', 'Oklahoma City', 0.0875, 'Oklahoma City Combined Tax'),
  ('OK', 'Tulsa', 0.0867, 'Tulsa Combined Tax'),
  ('OK', 'Norman', 0.0900, 'Norman Combined Tax'),
  ('OK', 'Broken Arrow', 0.0865, 'Broken Arrow Combined Tax'),
  ('OK', 'Lawton', 0.0875, 'Lawton Combined Tax'),
  ('OK', 'Edmond', 0.0850, 'Edmond Combined Tax')
ON CONFLICT DO NOTHING;

-- Add missing state base rates
INSERT INTO tax_rates (state, tax_rate, tax_name) VALUES
  ('AL', 0.0400, 'Alabama State Tax'),
  ('AR', 0.0650, 'Arkansas State Tax'),
  ('CO', 0.0290, 'Colorado State Tax'),
  ('CT', 0.0635, 'Connecticut State Tax'),
  ('GA', 0.0400, 'Georgia State Tax'),
  ('HI', 0.0400, 'Hawaii State Tax'),
  ('ID', 0.0600, 'Idaho State Tax'),
  ('IL', 0.0625, 'Illinois State Tax'),
  ('IN', 0.0700, 'Indiana State Tax'),
  ('IA', 0.0600, 'Iowa State Tax'),
  ('KS', 0.0650, 'Kansas State Tax'),
  ('KY', 0.0600, 'Kentucky State Tax'),
  ('LA', 0.0445, 'Louisiana State Tax'),
  ('ME', 0.0550, 'Maine State Tax'),
  ('MD', 0.0600, 'Maryland State Tax'),
  ('MA', 0.0625, 'Massachusetts State Tax'),
  ('MI', 0.0600, 'Michigan State Tax'),
  ('MN', 0.0688, 'Minnesota State Tax'),
  ('MS', 0.0700, 'Mississippi State Tax'),
  ('MO', 0.0423, 'Missouri State Tax'),
  ('NE', 0.0550, 'Nebraska State Tax'),
  ('NJ', 0.0663, 'New Jersey State Tax'),
  ('NM', 0.0513, 'New Mexico State Tax'),
  ('NC', 0.0475, 'North Carolina State Tax'),
  ('ND', 0.0500, 'North Dakota State Tax'),
  ('OH', 0.0575, 'Ohio State Tax'),
  ('OK', 0.0450, 'Oklahoma State Tax'),
  ('PA', 0.0600, 'Pennsylvania State Tax'),
  ('RI', 0.0700, 'Rhode Island State Tax'),
  ('SC', 0.0600, 'South Carolina State Tax'),
  ('SD', 0.0450, 'South Dakota State Tax'),
  ('TN', 0.0700, 'Tennessee State Tax'),
  ('UT', 0.0485, 'Utah State Tax'),
  ('VT', 0.0600, 'Vermont State Tax'),
  ('VA', 0.0430, 'Virginia State Tax'),
  ('WV', 0.0600, 'West Virginia State Tax'),
  ('WI', 0.0500, 'Wisconsin State Tax'),
  ('WY', 0.0400, 'Wyoming State Tax')
ON CONFLICT DO NOTHING;

-- Create an enhanced function that also returns the tax name/source
CREATE OR REPLACE FUNCTION get_tax_rate_details(
  p_state VARCHAR(2),
  p_city VARCHAR(100) DEFAULT NULL,
  p_zip_code VARCHAR(20) DEFAULT NULL
) RETURNS TABLE(
  tax_rate DECIMAL(5,4),
  tax_name VARCHAR(100),
  tax_level VARCHAR(20)
) AS $$
BEGIN
  -- First try to find exact match with zip code
  IF p_zip_code IS NOT NULL THEN
    RETURN QUERY
    SELECT tr.tax_rate, tr.tax_name, 'zip_code'::VARCHAR(20) as tax_level
    FROM tax_rates tr
    WHERE tr.state = p_state
      AND tr.city = p_city
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
    SELECT tr.tax_rate, tr.tax_name, 'city'::VARCHAR(20) as tax_level
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
  SELECT tr.tax_rate, tr.tax_name, 'state'::VARCHAR(20) as tax_level
  FROM tax_rates tr
  WHERE tr.state = p_state
    AND tr.city IS NULL
    AND tr.zip_code IS NULL
    AND tr.is_active = TRUE
  LIMIT 1;

  -- If no tax rate found, return default
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT 0.08::DECIMAL(5,4), 'Default Tax Rate'::VARCHAR(100), 'default'::VARCHAR(20);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Add comment
COMMENT ON FUNCTION get_tax_rate_details IS 'Returns the applicable tax rate, name, and level for a given location';

-- Create an index for better performance on city lookups
CREATE INDEX IF NOT EXISTS idx_tax_rates_city ON tax_rates(state, city) WHERE is_active = TRUE AND zip_code IS NULL;