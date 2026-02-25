-- CREATE suppliers table for vendor management
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  contact_person VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(20),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(50),
  zip_code VARCHAR(20),
  country VARCHAR(100) DEFAULT 'USA',
  website VARCHAR(255),
  tax_id VARCHAR(50),
  payment_terms VARCHAR(100), -- e.g., "Net 30", "2/10 Net 30"
  rating DECIMAL(2,1) CHECK (rating >= 0 AND rating <= 5), -- 0-5 rating
  preferred BOOLEAN DEFAULT FALSE,
  active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_supplier_name UNIQUE(name),
  CONSTRAINT valid_email CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+[.][A-Za-z]+$'),
  CONSTRAINT valid_website CHECK (website IS NULL OR website ~* '^https?://')
);

-- CREATE indexes for performance
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_active ON suppliers(active);
CREATE INDEX IF NOT EXISTS idx_suppliers_preferred ON suppliers(preferred);
CREATE INDEX IF NOT EXISTS idx_suppliers_rating ON suppliers(rating DESC);

-- ADD table and column comments
COMMENT ON TABLE suppliers IS 'Vendor/supplier master data with contact info and performance metrics';
COMMENT ON COLUMN suppliers.id IS 'Unique identifier for the supplier';
COMMENT ON COLUMN suppliers.name IS 'Supplier company name (unique)';
COMMENT ON COLUMN suppliers.contact_person IS 'Primary contact person name';
COMMENT ON COLUMN suppliers.email IS 'Primary email address';
COMMENT ON COLUMN suppliers.phone IS 'Primary phone number';
COMMENT ON COLUMN suppliers.address IS 'Full street address';
COMMENT ON COLUMN suppliers.payment_terms IS 'Payment terms (e.g., Net 30, 2/10 Net 30)';
COMMENT ON COLUMN suppliers.rating IS 'Supplier performance rating (0-5 scale)';
COMMENT ON COLUMN suppliers.preferred IS 'Whether this supplier is marked as preferred';
COMMENT ON COLUMN suppliers.active IS 'Whether supplier is currently active for new orders';
COMMENT ON COLUMN suppliers.created_at IS 'Timestamp when record was created';
COMMENT ON COLUMN suppliers.updated_at IS 'Timestamp when record was last updated';