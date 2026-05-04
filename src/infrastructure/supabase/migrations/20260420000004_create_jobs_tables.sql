-- Migration: 20260420000004_create_jobs_tables.sql
-- Jobs are customer-ordered projects. One job carries the customer
-- info inline (name, email, their PO number) and a list of parts to
-- cut. No separate `customers` table — if the manufacturer wants a
-- history view per customer later, they search by customer name.
--
-- Two tables:
--   `jobs`       — the parent record (customer + status + due date)
--   `job_parts`  — the line items (material × dims × quantity)
--
-- Linking cut history back to a job / job_part happens in the same
-- migration via ALTER TABLE on cut_history so the drawer can show
-- "Cut made for Job J-2026-00042" and the job detail page can show
-- cut progress.
--
-- User-scoped RLS on everything — mirrors the tenant-isolation
-- pattern on rolls / cuts / cut_history.

-- ─────────────────────────────────────────────────────────────
-- Job-number sequence (matches the po_number sequence pattern)
-- ─────────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS jobs_number_seq START 1;
COMMENT ON SEQUENCE jobs_number_seq IS
  'Monotonic sequence for jobs.job_number. Format: J-<6-digit zero-padded>. Do not reset.';

CREATE OR REPLACE FUNCTION jobs_assign_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.job_number IS NULL OR NEW.job_number = '' THEN
    NEW.job_number := 'J-' || LPAD(nextval('jobs_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────
-- jobs — one row per customer-ordered project
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS jobs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),

  job_number          TEXT UNIQUE,             -- auto-assigned via trigger (J-000001, …)
  name                VARCHAR(200) NOT NULL,
  description         TEXT,

  -- Customer info lives inline. No separate customers table —
  -- if the shop wants a cross-job view per customer, search by name.
  customer_name       VARCHAR(200),
  customer_email      VARCHAR(255),
  customer_phone      VARCHAR(50),
  customer_po_number  VARCHAR(100),            -- customer's own PO reference

  status              VARCHAR(20) NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'scheduled', 'in_progress', 'completed', 'cancelled')),
  due_date            DATE,
  completed_at        TIMESTAMPTZ,
  notes               TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT jobs_valid_customer_email
    CHECK (customer_email IS NULL OR customer_email ~* '^[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+[.][A-Za-z]+$')
);

CREATE INDEX IF NOT EXISTS idx_jobs_user_id       ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_job_number    ON jobs(job_number);
CREATE INDEX IF NOT EXISTS idx_jobs_status        ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_customer_name ON jobs(customer_name);
CREATE INDEX IF NOT EXISTS idx_jobs_due_date      ON jobs(due_date) WHERE due_date IS NOT NULL;

COMMENT ON TABLE  jobs                     IS 'Customer-ordered projects. Each job is a collection of parts to cut, billed to one customer.';
COMMENT ON COLUMN jobs.job_number          IS 'Human-readable identifier (J-000001, J-000002, …) auto-assigned by the jobs_assign_number trigger.';
COMMENT ON COLUMN jobs.customer_name       IS 'Customer company or contact name. Free-text — no FK to a customers table by design (keep it simple).';
COMMENT ON COLUMN jobs.customer_po_number  IS 'Customer''s own PO reference for this job, printed on the customer-facing receipt PDF.';
COMMENT ON COLUMN jobs.status              IS 'Lifecycle: draft → scheduled → in_progress → completed (or cancelled at any stage).';

CREATE TRIGGER jobs_assign_number_trigger
  BEFORE INSERT ON jobs
  FOR EACH ROW EXECUTE FUNCTION jobs_assign_number();

CREATE TRIGGER jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY jobs_select  ON jobs FOR SELECT  USING      (auth.uid() = user_id);
CREATE POLICY jobs_insert  ON jobs FOR INSERT  WITH CHECK (auth.uid() = user_id);
CREATE POLICY jobs_update  ON jobs FOR UPDATE  USING      (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY jobs_delete  ON jobs FOR DELETE  USING      (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- job_parts — line items on a job
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS job_parts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  job_id              UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  material_type_id    UUID REFERENCES material_types(id) ON DELETE SET NULL,
  material_type       VARCHAR(100),

  part_number         VARCHAR(100),             -- customer's own part number for this line
  description         TEXT,
  width               DECIMAL(10,3) NOT NULL CHECK (width > 0),
  length              DECIMAL(10,3) NOT NULL CHECK (length > 0),
  thickness           DECIMAL(10,3)         CHECK (thickness IS NULL OR thickness > 0),
  quantity            INTEGER NOT NULL CHECK (quantity > 0),
  unit_price          DECIMAL(10,2) CHECK (unit_price IS NULL OR unit_price >= 0),
  notes               TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_parts_job_id            ON job_parts(job_id);
CREATE INDEX IF NOT EXISTS idx_job_parts_user_id           ON job_parts(user_id);
CREATE INDEX IF NOT EXISTS idx_job_parts_material_type_id  ON job_parts(material_type_id)
  WHERE material_type_id IS NOT NULL;

COMMENT ON TABLE  job_parts               IS 'Line items on a job — one row per part (dimensions × quantity × material).';
COMMENT ON COLUMN job_parts.part_number   IS 'Customer-supplied part number if any (printed on receipt PDF). Not to be confused with rolls.part_number which is our internal barcode-ready ID.';

CREATE TRIGGER job_parts_updated_at
  BEFORE UPDATE ON job_parts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE job_parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_parts_select  ON job_parts FOR SELECT  USING      (auth.uid() = user_id);
CREATE POLICY job_parts_insert  ON job_parts FOR INSERT  WITH CHECK (auth.uid() = user_id);
CREATE POLICY job_parts_update  ON job_parts FOR UPDATE  USING      (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY job_parts_delete  ON job_parts FOR DELETE  USING      (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- Link cut_history back to the job (+ specific line item) that
-- drove the cut. Both optional — legacy cuts stay NULL, and
-- general-cutter flows without a selected job also stay NULL.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE cut_history
  ADD COLUMN IF NOT EXISTS job_id       UUID REFERENCES jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS job_part_id  UUID REFERENCES job_parts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cut_history_job_id
  ON cut_history(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cut_history_job_part_id
  ON cut_history(job_part_id) WHERE job_part_id IS NOT NULL;

COMMENT ON COLUMN cut_history.job_id       IS 'The job this cut fulfils. NULL on legacy cuts and general-cutter flows.';
COMMENT ON COLUMN cut_history.job_part_id  IS 'The specific line item the cut fulfils. Used on the job detail page to show per-part progress.';
