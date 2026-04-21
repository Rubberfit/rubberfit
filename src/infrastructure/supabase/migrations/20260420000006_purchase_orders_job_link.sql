-- Migration: 20260420000006_purchase_orders_job_link.sql
-- Links purchase orders back to the job that drove the need for
-- the material. A PO can still be standalone (pure inventory
-- replenishment) — `job_id` is optional. Cascade on delete is
-- SET NULL so cancelling a job doesn't nuke purchase history
-- the shop may still need for supplier reconciliation.

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_job_id
  ON purchase_orders(job_id)
  WHERE job_id IS NOT NULL;

COMMENT ON COLUMN purchase_orders.job_id IS
  'Optional job that triggered this purchase order. Set when the job sufficiency check routed the operator into the PO creator. Null for standalone inventory replenishment POs.';
