-- Add more city tax rates including Las Vegas with proper 8.375% rate
INSERT INTO tax_rates (state, city, tax_rate, tax_name) VALUES
  -- Nevada cities
  ('NV', 'Las Vegas', 0.08375, 'Las Vegas Combined Tax'),
  ('NV', 'Henderson', 0.08375, 'Henderson Combined Tax'),
  ('NV', 'Reno', 0.08265, 'Reno Combined Tax'),

  -- California cities
  ('CA', 'Los Angeles', 0.095, 'Los Angeles Combined Tax'),
  ('CA', 'San Francisco', 0.08625, 'San Francisco Combined Tax'),
  ('CA', 'San Diego', 0.0775, 'San Diego Combined Tax'),
  ('CA', 'San Jose', 0.09375, 'San Jose Combined Tax'),

  -- New York cities
  ('NY', 'New York City', 0.08875, 'NYC Combined Tax'),
  ('NY', 'Buffalo', 0.08, 'Buffalo Combined Tax'),
  ('NY', 'Rochester', 0.08, 'Rochester Combined Tax'),

  -- Florida cities (Florida has local option surtaxes)
  ('FL', 'Miami', 0.07, 'Miami Combined Tax'),
  ('FL', 'Orlando', 0.065, 'Orlando Combined Tax'),
  ('FL', 'Tampa', 0.075, 'Tampa Combined Tax'),
  ('FL', 'Jacksonville', 0.075, 'Jacksonville Combined Tax'),

  -- Illinois cities
  ('IL', 'Chicago', 0.1025, 'Chicago Combined Tax'),
  ('IL', 'Springfield', 0.0875, 'Springfield Combined Tax'),

  -- Additional Texas cities
  ('TX', 'Fort Worth', 0.0825, 'Fort Worth Combined Tax'),
  ('TX', 'El Paso', 0.0825, 'El Paso Combined Tax'),

  -- Washington cities
  ('WA', 'Seattle', 0.1025, 'Seattle Combined Tax'),
  ('WA', 'Tacoma', 0.102, 'Tacoma Combined Tax'),
  ('WA', 'Spokane', 0.09, 'Spokane Combined Tax'),

  -- Arizona cities
  ('AZ', 'Phoenix', 0.084, 'Phoenix Combined Tax'),
  ('AZ', 'Tucson', 0.087, 'Tucson Combined Tax'),
  ('AZ', 'Scottsdale', 0.0895, 'Scottsdale Combined Tax'),

  -- Ohio cities (for your default address)
  ('OH', 'Columbus', 0.075, 'Columbus Combined Tax'),
  ('OH', 'Cleveland', 0.08, 'Cleveland Combined Tax'),
  ('OH', 'Cincinnati', 0.0705, 'Cincinnati Combined Tax')
ON CONFLICT DO NOTHING;