-- Fix valid_approval constraint on purchase_orders.
--
-- The original constraint forced approved_by/approved_at to be NULL whenever
-- status was not 'approved', which made it impossible to transition a PO from
-- 'approved' to 'ordered'/'received' while preserving the approval record.
--
-- New rule: if a PO is in 'approved' status, approved_by and approved_at must
-- be set. Downstream statuses (ordered, received, cancelled) may retain the
-- original approval stamp for audit purposes.

ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS valid_approval;

ALTER TABLE purchase_orders ADD CONSTRAINT valid_approval CHECK (
  status != 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
);
