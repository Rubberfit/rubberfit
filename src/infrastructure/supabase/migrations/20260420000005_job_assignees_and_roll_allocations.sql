-- Migration: 20260420000005_job_assignees_and_roll_allocations.sql
-- Two thin join tables on top of `jobs`:
--   • job_assignees        — the shop-floor roster on the job
--                            (one "lead" + N "workers")
--   • job_roll_allocations — which inventory rolls (and how much of
--                            each) are earmarked to fulfil the job
--
-- Both are user-scoped via RLS, both cascade-delete with their
-- parent job. The PDF export (shop-ready job sheet) reads from
-- these tables plus `job_parts` to build its sections — same
-- shape as the PO PDF, different domain.

-- ─────────────────────────────────────────────────────────────
-- job_assignees — people on the job
--
-- Free-text names rather than FK into profiles, because most
-- rubber-shop cutters don't have portal accounts. If/when we
-- onboard them, a nullable profile_id can be added in a later
-- migration without disturbing this shape.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS job_assignees (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  job_id      UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,

  name        VARCHAR(200) NOT NULL,
  role        VARCHAR(20) NOT NULL CHECK (role IN ('lead', 'worker')),
  notes       TEXT,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_assignees_job_id   ON job_assignees(job_id);
CREATE INDEX IF NOT EXISTS idx_job_assignees_user_id  ON job_assignees(user_id);
-- Only one lead per job — keeps the "who's responsible" question
-- unambiguous on the shop floor and on the printed sheet.
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_assignees_one_lead
  ON job_assignees(job_id)
  WHERE role = 'lead';

COMMENT ON TABLE  job_assignees       IS 'Shop-floor roster for a job: one lead + one or more workers. Free-text names because most cutters do not have portal accounts.';
COMMENT ON COLUMN job_assignees.role  IS 'lead | worker. Lead is the point-of-contact on the printed job sheet; there can be only one per job.';

CREATE TRIGGER job_assignees_updated_at
  BEFORE UPDATE ON job_assignees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE job_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_assignees_select ON job_assignees FOR SELECT USING      (auth.uid() = user_id);
CREATE POLICY job_assignees_insert ON job_assignees FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY job_assignees_update ON job_assignees FOR UPDATE USING      (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY job_assignees_delete ON job_assignees FOR DELETE USING      (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- job_roll_allocations — earmark inventory for a job
--
-- `allocated_length` is in inches (same unit as `rolls.length` /
-- `rolls.remaining_length`). A job can pull from multiple rolls;
-- a roll can be split across multiple jobs. Allocation is
-- informational — actual consumption still flows through
-- cut_history + the rolls.remaining_length decrement the cut
-- route already does.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS job_roll_allocations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  job_id             UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  roll_id            UUID NOT NULL REFERENCES rolls(id) ON DELETE RESTRICT,

  allocated_length   DECIMAL(10,3) NOT NULL CHECK (allocated_length > 0),
  notes              TEXT,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT job_roll_allocations_unique UNIQUE (job_id, roll_id)
);

CREATE INDEX IF NOT EXISTS idx_job_roll_alloc_job_id   ON job_roll_allocations(job_id);
CREATE INDEX IF NOT EXISTS idx_job_roll_alloc_roll_id  ON job_roll_allocations(roll_id);
CREATE INDEX IF NOT EXISTS idx_job_roll_alloc_user_id  ON job_roll_allocations(user_id);

COMMENT ON TABLE  job_roll_allocations                  IS 'Which inventory rolls and how much of each are earmarked for a job. Informational — real consumption still flows through cut_history.';
COMMENT ON COLUMN job_roll_allocations.allocated_length IS 'Length earmarked from the source roll, in inches. Does not decrement rolls.remaining_length — that happens on cut.';

CREATE TRIGGER job_roll_allocations_updated_at
  BEFORE UPDATE ON job_roll_allocations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE job_roll_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_roll_allocations_select ON job_roll_allocations FOR SELECT USING      (auth.uid() = user_id);
CREATE POLICY job_roll_allocations_insert ON job_roll_allocations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY job_roll_allocations_update ON job_roll_allocations FOR UPDATE USING      (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY job_roll_allocations_delete ON job_roll_allocations FOR DELETE USING      (auth.uid() = user_id);
