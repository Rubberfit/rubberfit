-- ═══════════════════════════════════════════════════════════════════════════
-- REDESIGN — File 4 of 9: Commerce schema
-- ═══════════════════════════════════════════════════════════════════════════
-- Tables (in dependency order):
--   projects, project_owners, project_materials, project_cut_histories,
--   invoices, jobs, purchase_orders, purchase_order_items
--
-- Design decisions:
--   • Every table tenant-scoped (CASCADE)
--   • Money: bigint cents; areas: numeric(12,3) sqm (user-input context)
--   • Status enums stored as varchar with CHECK — not Postgres enum types
--     (easier to evolve; matches core/inventory conventions)
--   • Join tables (project_owners, project_materials, project_cut_histories)
--     drop the redundant user_id column — the `created_by` audit field
--     covers "who added this link". Exception: project_owners keeps a
--     distinct `owner_profile_id` because the owner ≠ whoever added them.
--   • Nullable invoice_id / person_id on jobs — a job exists before an
--     invoice is cut and may not have a customer contact.
--
-- Known bugs from msql_rebuild fixed here:
--   • purchase_orders.requestd_delivery_date → requested_delivery_date
--   • purchase_orders.deleted_date → deleted_at
--   • purchase_orders.actual_delivery_date NOT NULL → NULL
--   • purchase_order_items missing tenant_id → added
--   • purchase_order_items.deleted_at NOT NULL → NULL
--   • Stripe-style ID columns (none in this file) kept as varchar(255), not uuid
--
-- Indexes (non-unique), triggers, RLS live in files 7–9.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── projects ──────────────────────────────────────────────────────────────
-- A unit of work for a customer. Can fan out to jobs, cut_history entries,
-- materials, and an invoice.

CREATE TABLE projects (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                varchar(200) NOT NULL,
  description         text,
  status              varchar(20) NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
  start_date          date,
  end_date            date,
  person_id           uuid REFERENCES persons(id) ON DELETE SET NULL,
  budget_cents        bigint CHECK (budget_cents IS NULL OR budget_cents >= 0),
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at          timestamptz,

  CONSTRAINT projects_valid_date_range
    CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

COMMENT ON COLUMN projects.person_id IS
  'Customer contact for this project. NULL for internal/ad-hoc projects.';


-- ─── project_owners ────────────────────────────────────────────────────────
-- Many-to-many: users who own a project. owner_profile_id is the semantic
-- owner; created_by is who assigned them (can differ).

CREATE TABLE project_owners (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  owner_profile_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at          timestamptz,

  CONSTRAINT project_owners_unique UNIQUE (project_id, owner_profile_id)
);


-- ─── project_materials ─────────────────────────────────────────────────────
-- Materials allocated to a project, with required vs. allocated tracking.

CREATE TABLE project_materials (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id               uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  material_type_id         uuid NOT NULL REFERENCES material_types(id) ON DELETE RESTRICT,
  required_quantity_sqm    numeric(12,3)
                           CHECK (required_quantity_sqm IS NULL OR required_quantity_sqm >= 0),
  allocated_quantity_sqm   numeric(12,3) NOT NULL DEFAULT 0
                           CHECK (allocated_quantity_sqm >= 0),
  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at               timestamptz NOT NULL DEFAULT now(),
  updated_by               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at               timestamptz,

  CONSTRAINT project_materials_unique UNIQUE (project_id, material_type_id)
);


-- ─── project_cut_histories ─────────────────────────────────────────────────
-- Junction linking projects to cut_history records. A single cut_history
-- row can be associated with zero or one project.

CREATE TABLE project_cut_histories (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cut_history_id      uuid NOT NULL REFERENCES cut_history(id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at          timestamptz,

  CONSTRAINT project_cut_histories_unique UNIQUE (project_id, cut_history_id)
);


-- ─── invoices ──────────────────────────────────────────────────────────────
-- Customer invoice. project_id / person_id are nullable to support ad-hoc
-- invoices not tied to a project.

CREATE TABLE invoices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id          uuid REFERENCES projects(id) ON DELETE SET NULL,
  person_id           uuid REFERENCES persons(id) ON DELETE SET NULL,
  billing_address_id  uuid REFERENCES addresses(id) ON DELETE SET NULL,
  invoice_number      varchar(50) NOT NULL,
  issue_date          date NOT NULL DEFAULT CURRENT_DATE,
  due_date            date,
  status              varchar(20) NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'void')),
  subtotal_cents      bigint NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  tax_cents           bigint NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  discount_cents      bigint NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  total_cents         bigint NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  paid_cents          bigint NOT NULL DEFAULT 0 CHECK (paid_cents >= 0),
  balance_cents       bigint NOT NULL DEFAULT 0,
  payment_terms       varchar(200),
  notes               text,
  pdf_url             varchar(500),
  sent_at             timestamptz,
  paid_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at          timestamptz,

  CONSTRAINT invoices_tenant_number_unique UNIQUE (tenant_id, invoice_number),
  CONSTRAINT invoices_valid_due_date
    CHECK (due_date IS NULL OR due_date >= issue_date),
  CONSTRAINT invoices_paid_le_total CHECK (paid_cents <= total_cents)
);

COMMENT ON COLUMN invoices.balance_cents IS
  'Outstanding balance (total_cents - paid_cents). Kept as a column for query perf; app should keep it in sync with paid_cents.';


-- ─── jobs ──────────────────────────────────────────────────────────────────
-- Individual work items under a project (e.g., a single install or fabrication).
-- Can be linked to an invoice once billed.

CREATE TABLE jobs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  person_id           uuid REFERENCES persons(id) ON DELETE SET NULL,
  invoice_id          uuid REFERENCES invoices(id) ON DELETE SET NULL,
  description         text NOT NULL,
  location            varchar(200),
  status              varchar(20) NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'in_progress', 'completed', 'cancelled')),
  start_date          date,
  completed_date      date,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at          timestamptz,

  CONSTRAINT jobs_valid_date_range
    CHECK (completed_date IS NULL OR start_date IS NULL OR completed_date >= start_date)
);


-- ─── purchase_orders ───────────────────────────────────────────────────────
-- PO issued to a supplier. Can be manually created or auto-generated by
-- reorder rules (auto_generated flag + reorder_rule_id snapshot).

CREATE TABLE purchase_orders (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_id               uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  shipping_address_id       uuid REFERENCES addresses(id) ON DELETE SET NULL,
  billing_address_id        uuid REFERENCES addresses(id) ON DELETE SET NULL,
  reorder_rule_id           uuid REFERENCES reorder_rules(id) ON DELETE SET NULL,
  po_number                 varchar(50) NOT NULL,
  status                    varchar(30) NOT NULL DEFAULT 'draft'
                            CHECK (status IN (
                              'draft', 'pending_approval', 'approved',
                              'ordered', 'partial_received', 'received', 'cancelled'
                            )),
  order_date                date,
  requested_delivery_date   date,
  actual_delivery_date      date,
  subtotal_cents            bigint NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  tax_amount_cents          bigint NOT NULL DEFAULT 0 CHECK (tax_amount_cents >= 0),
  shipping_cost_cents       bigint NOT NULL DEFAULT 0 CHECK (shipping_cost_cents >= 0),
  total_amount_cents        bigint NOT NULL DEFAULT 0 CHECK (total_amount_cents >= 0),
  payment_terms             varchar(200),
  notes                     text,
  auto_generated            boolean NOT NULL DEFAULT false,
  approved_by               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at               timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  created_by                uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at                timestamptz NOT NULL DEFAULT now(),
  updated_by                uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at                timestamptz,

  CONSTRAINT purchase_orders_tenant_po_number_unique UNIQUE (tenant_id, po_number),
  CONSTRAINT purchase_orders_valid_delivery_dates
    CHECK (requested_delivery_date IS NULL
           OR order_date IS NULL
           OR requested_delivery_date >= order_date)
);

COMMENT ON COLUMN purchase_orders.reorder_rule_id IS
  'If auto_generated = true, the reorder_rules row that triggered this PO. SET NULL on rule delete to preserve history.';


-- ─── purchase_order_items ──────────────────────────────────────────────────
-- Line items on a PO. quantity_sqm is what was ordered; quantity_received_sqm
-- is updated as receipts come in.

CREATE TABLE purchase_order_items (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  purchase_order_id        uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  material_type_id         uuid NOT NULL REFERENCES material_types(id) ON DELETE RESTRICT,
  line_number              integer NOT NULL CHECK (line_number > 0),
  description              varchar(500),
  width_mm                 integer CHECK (width_mm IS NULL OR width_mm > 0),
  length_mm                integer CHECK (length_mm IS NULL OR length_mm > 0),
  thickness_mm             numeric(8,3) CHECK (thickness_mm IS NULL OR thickness_mm > 0),
  color                    varchar(50),
  quantity_sqm             numeric(12,3) NOT NULL CHECK (quantity_sqm > 0),
  quantity_received_sqm    numeric(12,3) NOT NULL DEFAULT 0
                           CHECK (quantity_received_sqm >= 0),
  unit_cost_cents          bigint NOT NULL CHECK (unit_cost_cents >= 0),
  line_total_cents         bigint NOT NULL CHECK (line_total_cents >= 0),
  received_date            date,
  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at               timestamptz NOT NULL DEFAULT now(),
  updated_by               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at               timestamptz,

  CONSTRAINT purchase_order_items_po_line_unique
    UNIQUE (purchase_order_id, line_number),
  CONSTRAINT purchase_order_items_received_le_ordered
    CHECK (quantity_received_sqm <= quantity_sqm)
);

COMMENT ON COLUMN purchase_order_items.unit_cost_cents IS
  'Price per square meter in cents (matches material_suppliers.cost_per_sqm_cents units).';
COMMENT ON COLUMN purchase_order_items.line_total_cents IS
  'Snapshot of quantity_sqm * unit_cost_cents at PO-issue time. Not recomputed on later edits.';
