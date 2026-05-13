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
  -- Billing address snapshot (inline; no shared addresses table). Frozen
  -- at issue time so historical invoices keep their issued-to address
  -- even if the customer's current address later changes.
  billing_line1       varchar(200),
  billing_line2       varchar(200),
  billing_city        varchar(100),
  billing_state       varchar(100),
  billing_postal_code varchar(20),
  billing_country     varchar(100) DEFAULT 'United States',
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
-- Hybrid model (per ARC-25 plan v3): supports both
--   (a) 111's normalized usage — child of a project, customer is a `persons` FK,
--       optional invoice link;
--   (b) dev's flat usage — standalone job (no project), inline customer fields,
--       auto-assigned job_number for shop-floor identification.
--
-- The two patterns coexist: project_id and person_id are nullable; the
-- jobs_anchored CHECK enforces that every job is anchored to *something*
-- (project, person, or inline customer name). Phase 3 service migration in
-- ARC-25 reads the available shape; later PRs can deprecate the inline path.

CREATE TABLE jobs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id          uuid REFERENCES projects(id) ON DELETE CASCADE,
  person_id           uuid REFERENCES persons(id) ON DELETE SET NULL,
  invoice_id          uuid REFERENCES invoices(id) ON DELETE SET NULL,
  job_number          varchar(50) UNIQUE,
  name                varchar(200),
  description         text,
  location            varchar(200),
  customer_name       varchar(200),
  customer_email      varchar(255),
  customer_phone      varchar(50),
  customer_po_number  varchar(100),
  status              varchar(20) NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'scheduled', 'in_progress', 'completed', 'cancelled')),
  start_date          date,
  due_date            date,
  completed_date      date,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at          timestamptz,

  CONSTRAINT jobs_valid_date_range
    CHECK (completed_date IS NULL OR start_date IS NULL OR completed_date >= start_date),
  CONSTRAINT jobs_valid_customer_email
    CHECK (customer_email IS NULL
           OR customer_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  CONSTRAINT jobs_has_identifier
    CHECK (name IS NOT NULL OR description IS NOT NULL OR job_number IS NOT NULL),
  CONSTRAINT jobs_anchored
    CHECK (project_id IS NOT NULL
           OR person_id IS NOT NULL
           OR customer_name IS NOT NULL)
);

COMMENT ON COLUMN jobs.job_number IS
  'Human-readable identifier (J-000001, J-000002, …) auto-assigned by the jobs_assign_number trigger in file 8. Unique globally; unscoped from tenant for legacy compatibility.';
COMMENT ON COLUMN jobs.name IS
  'Job title as a separate field from description. Dev-pattern: jobs UI uses name as the primary heading. Either name, description, or job_number must be set (CHECK jobs_has_identifier).';
COMMENT ON COLUMN jobs.customer_name IS
  'Inline customer name when the job is not anchored to a persons row. Free-text fallback for the flat dev pattern.';
COMMENT ON COLUMN jobs.customer_po_number IS
  'Customer''s own PO reference for this job; printed on the customer-facing receipt PDF.';
COMMENT ON COLUMN jobs.status IS
  'Lifecycle: draft → scheduled → in_progress → completed (or cancelled at any stage). `scheduled` matches the dev-pattern shop-floor planning view.';


-- ─── purchase_orders ───────────────────────────────────────────────────────
-- PO issued to a supplier. Can be manually created or auto-generated by
-- reorder rules (auto_generated flag + reorder_rule_id snapshot).

CREATE TABLE purchase_orders (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_id               uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  -- Shipping + billing address snapshots (inline; no shared addresses
  -- table). Frozen at issue time so historical POs reflect the
  -- destination they were sent to, not whatever's current today.
  shipping_line1            varchar(200),
  shipping_line2            varchar(200),
  shipping_city             varchar(100),
  shipping_state            varchar(100),
  shipping_postal_code      varchar(20),
  shipping_country          varchar(100) DEFAULT 'United States',
  billing_line1             varchar(200),
  billing_line2             varchar(200),
  billing_city              varchar(100),
  billing_state             varchar(100),
  billing_postal_code       varchar(20),
  billing_country           varchar(100) DEFAULT 'United States',
  reorder_rule_id           uuid REFERENCES reorder_rules(id) ON DELETE SET NULL,
  job_id                    uuid REFERENCES jobs(id) ON DELETE SET NULL,
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
COMMENT ON COLUMN purchase_orders.job_id IS
  'Optional job that triggered this PO. Set when the job sufficiency check routed the operator into the PO creator. NULL for standalone inventory replenishment POs. SET NULL on job delete preserves PO history.';


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


-- ─── job_parts ─────────────────────────────────────────────────────────────
-- Per-job line items (material × dimensions × quantity). Used by the
-- customer-facing receipt PDF, the job-sheet PDF, and the cutting-engine
-- "open this job" flow that loads parts into the AutoNest input.

CREATE TABLE job_parts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_id              uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  material_type_id    uuid NOT NULL REFERENCES material_types(id) ON DELETE RESTRICT,
  line_number         integer NOT NULL CHECK (line_number > 0),
  description         varchar(500),
  width_mm            integer CHECK (width_mm IS NULL OR width_mm > 0),
  length_mm           integer CHECK (length_mm IS NULL OR length_mm > 0),
  thickness_mm        numeric(8,3) CHECK (thickness_mm IS NULL OR thickness_mm > 0),
  quantity            integer NOT NULL CHECK (quantity > 0),
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at          timestamptz,

  CONSTRAINT job_parts_unique_line UNIQUE (job_id, line_number)
);

COMMENT ON TABLE job_parts IS
  'Per-job line items. Dimensions in mm (per the metric storage convention). The TS layer converts to display units.';
COMMENT ON COLUMN job_parts.line_number IS
  'Line position within the job. Used for receipt PDF ordering. Unique per job.';


-- ─── job_assignees ─────────────────────────────────────────────────────────
-- Shop-floor roster on a job: one lead + N workers. Free-text `name`
-- (NOT FK to profiles) by design — most rubber-shop cutters don''t have
-- portal accounts. If/when they''re onboarded, a nullable profile_id
-- column can be added in a later migration.

CREATE TABLE job_assignees (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_id      uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  name        varchar(200) NOT NULL,
  role        varchar(20) NOT NULL CHECK (role IN ('lead', 'worker')),
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at  timestamptz
);

COMMENT ON TABLE job_assignees IS
  'Shop-floor roster for a job: one lead + one or more workers. Free-text names because most cutters do not have portal accounts.';
COMMENT ON COLUMN job_assignees.role IS
  'lead | worker. Lead is the point-of-contact on the printed job sheet; the partial unique index in file 7 enforces one lead per job.';


-- ─── job_roll_allocations ──────────────────────────────────────────────────
-- Informational pre-allocation: which inventory rolls (and how much of each)
-- are earmarked to fulfil the job. Does NOT decrement remaining_length_mm —
-- real consumption flows through cut_history + the cuts trigger that
-- decrements rolls.remaining_length_mm.

CREATE TABLE job_roll_allocations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_id               uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  roll_id              uuid NOT NULL REFERENCES rolls(id) ON DELETE RESTRICT,
  allocated_length_mm  integer NOT NULL CHECK (allocated_length_mm > 0),
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at           timestamptz,

  CONSTRAINT job_roll_allocations_unique UNIQUE (job_id, roll_id)
);

COMMENT ON TABLE job_roll_allocations IS
  'Earmarked inventory per job × roll. Informational — actual consumption flows through cut_history.';
COMMENT ON COLUMN job_roll_allocations.allocated_length_mm IS
  'Length earmarked from the source roll, in mm. Does not decrement rolls.remaining_length_mm — that happens on cut.';
