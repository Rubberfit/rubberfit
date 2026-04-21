-- ═══════════════════════════════════════════════════════════════════════════
-- REDESIGN — File 2 of 9: Inventory schema
-- ═══════════════════════════════════════════════════════════════════════════
-- Tables (in dependency order):
--   material_types, suppliers, supplier_contacts, material_suppliers,
--   rolls, price_history, reorder_rules
--
-- Design decisions:
--   • Units: lengths in mm (integer; numeric(8,3) exception for thickness),
--            prices in cents per m² (bigint)
--   • tenant_id on every table with ON DELETE CASCADE
--   • Audit: created_at/by, updated_at/by, deleted_at on mutable tables.
--            price_history is immutable (created_at/by only).
--   • Suppliers reference addresses (file 1) by FK, not inline address fields
--   • supplier_contacts joins suppliers ↔ persons (file 1)
--   • Tax: suppliers.tax_rate is a local override; global tax_rates comes in file 6.
--          The old tax_id → Tax_Rate FK is dropped; suppliers.tax_id is just
--          an external registration number (EIN).
--
-- Indexes (non-unique), triggers, and RLS live in files 7–9.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── material_types ────────────────────────────────────────────────────────
-- Tenant-scoped catalog of material categories (e.g., "Acrylic", "Vinyl").
-- Pricing lives on material_suppliers, not here.

CREATE TABLE material_types (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                varchar(100) NOT NULL,
  description         text,
  min_stock_sqm       numeric(12,3) CHECK (min_stock_sqm IS NULL OR min_stock_sqm >= 0),
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at          timestamptz,

  CONSTRAINT material_types_tenant_name_unique UNIQUE (tenant_id, name)
);

COMMENT ON TABLE material_types IS
  'Tenant-scoped catalog of material categories. Pricing lives on material_suppliers.';
COMMENT ON COLUMN material_types.min_stock_sqm IS
  'Aggregate low-stock alert threshold (sum of remaining length × width across active rolls).';


-- ─── suppliers ─────────────────────────────────────────────────────────────
-- Tenant-scoped supplier directory. Address lives in addresses (file 1).

CREATE TABLE suppliers (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                 varchar(200) NOT NULL,
  address_id           uuid REFERENCES addresses(id) ON DELETE SET NULL,
  email                varchar(320),
  general_phone        varchar(30),
  website              varchar(500),
  tax_id               varchar(50),
  tax_rate             numeric(5,4)
                       CHECK (tax_rate IS NULL OR (tax_rate >= 0 AND tax_rate <= 1)),
  tax_exempt           boolean NOT NULL DEFAULT false,
  payment_terms        varchar(200),
  shipping_cost_cents  bigint CHECK (shipping_cost_cents IS NULL OR shipping_cost_cents >= 0),
  rating               smallint CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5)),
  preferred            boolean NOT NULL DEFAULT false,
  active               boolean NOT NULL DEFAULT true,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at           timestamptz,

  CONSTRAINT suppliers_tenant_name_unique UNIQUE (tenant_id, name),
  CONSTRAINT suppliers_email_format
    CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  CONSTRAINT suppliers_website_format
    CHECK (website IS NULL OR website ~* '^https?://')
);

COMMENT ON COLUMN suppliers.tax_id IS
  'External tax registration number (e.g., EIN). Free-form string, not an FK.';
COMMENT ON COLUMN suppliers.tax_rate IS
  'Local tax-rate override (0..1). NULL means "use tenant/jurisdiction default from tax_rates".';


-- ─── supplier_contacts ─────────────────────────────────────────────────────
-- Join table between suppliers and persons. Tracks role/title of a person at
-- a supplier, with a single primary contact enforced via filtered unique index.

CREATE TABLE supplier_contacts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_id         uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  person_id           uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  title               varchar(100),
  role                varchar(50),
  department          varchar(100),
  is_primary          boolean NOT NULL DEFAULT false,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at          timestamptz,

  CONSTRAINT supplier_contacts_unique UNIQUE (supplier_id, person_id)
);

CREATE UNIQUE INDEX supplier_contacts_one_primary_per_supplier
  ON supplier_contacts (supplier_id)
  WHERE is_primary = true AND is_active = true AND deleted_at IS NULL;


-- ─── material_suppliers ────────────────────────────────────────────────────
-- Per-tenant pricing: which suppliers carry which materials, at what price.

CREATE TABLE material_suppliers (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  material_type_id        uuid NOT NULL REFERENCES material_types(id) ON DELETE CASCADE,
  supplier_id             uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  supplier_material_code  varchar(100),
  cost_per_sqm_cents      bigint NOT NULL CHECK (cost_per_sqm_cents > 0),
  minimum_order_sqm       numeric(12,3) NOT NULL DEFAULT 0
                          CHECK (minimum_order_sqm >= 0),
  lead_time_days          integer NOT NULL DEFAULT 0 CHECK (lead_time_days >= 0),
  preferred_supplier      boolean NOT NULL DEFAULT false,
  active                  boolean NOT NULL DEFAULT true,
  notes                   text,
  effective_date          date NOT NULL DEFAULT CURRENT_DATE,
  expiration_date         date,
  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at              timestamptz NOT NULL DEFAULT now(),
  updated_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at              timestamptz,

  CONSTRAINT material_suppliers_material_supplier_unique
    UNIQUE (material_type_id, supplier_id),
  CONSTRAINT material_suppliers_valid_date_range
    CHECK (expiration_date IS NULL OR expiration_date > effective_date)
);

COMMENT ON COLUMN material_suppliers.cost_per_sqm_cents IS
  'Price in cents per square meter. To cost a cut: (area_sqmm * cost_per_sqm_cents) / 1,000,000.';


-- ─── rolls ─────────────────────────────────────────────────────────────────
-- Physical inventory: one row per piece of stock. Two sources:
--   • source_type = 'received' — a roll purchased from a supplier (normal case)
--   • source_type = 'offcut'   — a reusable leftover produced by a cut job.
--                                parent_roll_id points to the roll it came
--                                from; source_cut_history_id points to the
--                                cut that produced it (FK added in file 3).
-- Offcuts inherit material_type_id / supplier_id / cost_per_sqm_cents from
-- their parent roll at creation time (enforced in app layer, not schema).

CREATE TABLE rolls (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  material_type_id     uuid NOT NULL REFERENCES material_types(id) ON DELETE RESTRICT,
  supplier_id          uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  source_type          varchar(20) NOT NULL DEFAULT 'received'
                       CHECK (source_type IN ('received', 'offcut')),
  parent_roll_id       uuid REFERENCES rolls(id) ON DELETE RESTRICT,
  width_mm             integer NOT NULL CHECK (width_mm > 0),
  length_mm            integer NOT NULL CHECK (length_mm > 0),
  remaining_length_mm  integer NOT NULL CHECK (remaining_length_mm >= 0),
  thickness_mm         numeric(8,3) NOT NULL CHECK (thickness_mm > 0),
  color                varchar(50),
  location             varchar(100),
  date_received        date NOT NULL DEFAULT CURRENT_DATE,
  cost_per_sqm_cents   bigint CHECK (cost_per_sqm_cents IS NULL OR cost_per_sqm_cents >= 0),
  status               varchar(20) NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'depleted', 'reserved')),
  notes                text,
  qr_generated_at      timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at           timestamptz,

  CONSTRAINT rolls_remaining_within_length
    CHECK (remaining_length_mm <= length_mm),
  CONSTRAINT rolls_parent_not_self
    CHECK (parent_roll_id IS NULL OR parent_roll_id <> id)
);

COMMENT ON COLUMN rolls.source_type IS
  'received = purchased from a supplier; offcut = reusable leftover from a cut job.';
COMMENT ON COLUMN rolls.parent_roll_id IS
  'The roll this offcut was cut from. NULL for received rolls. Required for offcuts (CHECK added in file 3 alongside source_cut_history_id).';
COMMENT ON COLUMN rolls.thickness_mm IS
  'Thickness in mm. Uses numeric(8,3) because material thicknesses are commonly sub-mm (e.g., 0.5 mm vinyl).';
COMMENT ON COLUMN rolls.cost_per_sqm_cents IS
  'Snapshot of material_suppliers.cost_per_sqm_cents at time of receipt. For offcuts, inherited from parent roll at creation.';


-- ─── price_history ─────────────────────────────────────────────────────────
-- Immutable log of cost changes on material_suppliers. No updated_at / no
-- deleted_at. price_change_percentage is populated by trigger (file 8).

CREATE TABLE price_history (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  material_supplier_id     uuid NOT NULL REFERENCES material_suppliers(id) ON DELETE CASCADE,
  old_cost_per_sqm_cents   bigint
                           CHECK (old_cost_per_sqm_cents IS NULL OR old_cost_per_sqm_cents > 0),
  new_cost_per_sqm_cents   bigint NOT NULL CHECK (new_cost_per_sqm_cents > 0),
  price_change_percentage  numeric(8,4),
  change_reason            varchar(200),
  effective_date           date NOT NULL DEFAULT CURRENT_DATE,
  changed_by               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE price_history IS
  'Immutable log of price changes. Inserts only — no updates, no deletes.';
COMMENT ON COLUMN price_history.price_change_percentage IS
  'Populated by BEFORE INSERT trigger in file 8 from old/new cost values.';


-- ─── reorder_rules ─────────────────────────────────────────────────────────
-- One reorder rule per material type per tenant. Drives low-stock alerts
-- and (optionally) auto-reorder PO creation.

CREATE TABLE reorder_rules (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  material_type_id       uuid NOT NULL REFERENCES material_types(id) ON DELETE CASCADE,
  supplier_id            uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  reorder_point_sqm      numeric(12,3) NOT NULL CHECK (reorder_point_sqm >= 0),
  reorder_quantity_sqm   numeric(12,3) NOT NULL CHECK (reorder_quantity_sqm > 0),
  max_stock_level_sqm    numeric(12,3),
  lead_time_days         integer NOT NULL DEFAULT 7 CHECK (lead_time_days >= 0),
  safety_stock_days      integer NOT NULL DEFAULT 3 CHECK (safety_stock_days >= 0),
  auto_reorder           boolean NOT NULL DEFAULT false,
  active                 boolean NOT NULL DEFAULT true,
  notes                  text,
  last_triggered_at      timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  updated_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at             timestamptz,

  CONSTRAINT reorder_rules_material_type_unique UNIQUE (material_type_id),
  CONSTRAINT reorder_rules_valid_stock_levels
    CHECK (max_stock_level_sqm IS NULL OR max_stock_level_sqm > reorder_point_sqm)
);

COMMENT ON TABLE reorder_rules IS
  'One rule per material_type (material_type_id is already tenant-scoped, so no composite key needed).';
