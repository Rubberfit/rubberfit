-- ═══════════════════════════════════════════════════════════════════════════
-- Step 7b — PO-receipt reconciliation view
-- ═══════════════════════════════════════════════════════════════════════════
-- The `ReceivePurchaseOrderUseCase` orchestrates two writes per receipt
-- delta: (1) the PO aggregate's `quantity_received_sqm` update, then
-- (2) zero-or-more roll inserts that materialize the received material
-- into queryable inventory. Step 7a left these strict-throw — if a roll
-- insert fails after the PO write succeeds, the use-case throws and
-- the operator must reconcile manually.
--
-- Step 7b reframes the use-case to best-effort (catch + log per-roll
-- failures, return failedItemIds in the result). This view is the
-- safety net for that mode: it surfaces every PO item that has
-- accumulated receipts but has zero matching rolls, so an admin /
-- reconciliation worker can backfill the missing inventory without
-- replaying the whole receive flow.
--
-- Joins on `rolls.purchase_order_item_id` — the FK added in file 4 of
-- the base redesign migration set (deferred there because the FK
-- target `purchase_order_items` is defined in file 4).
--
-- RLS: views default to SECURITY DEFINER semantics and would run as the
-- view owner, bypassing the underlying tables' RLS for the caller.
-- `WITH (security_invoker = true)` makes the view evaluate RLS against
-- the calling user's JWT, so tenant scoping carries through. Caught in
-- pre-flight review — without this the GRANT below would leak rows
-- across tenants.
--
-- Tenant scoping is doubly enforced: the join condition includes
-- `r.tenant_id = poi.tenant_id` so even a hypothetical cross-tenant FK
-- (which the FK definition allows in theory — it doesn't constrain
-- tenant_id) can't match. Belt-and-suspenders next to security_invoker.
--
-- `ON DELETE SET NULL` on `rolls.purchase_order_item_id` fires only on
-- hard delete of a PO item, which is rare — PO items are soft-deleted
-- via the `deleted_at` flag. Soft-delete leaves the FK intact, which
-- is correct: a received roll's provenance pointer survives the PO
-- item being archived.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW po_receipts_pending_roll_creation
WITH (security_invoker = true) AS
SELECT
  poi.id                       AS purchase_order_item_id,
  poi.purchase_order_id,
  poi.tenant_id,
  poi.line_number,
  poi.material_type_id,
  poi.quantity_received_sqm,
  poi.received_date,
  poi.updated_at               AS receipt_last_updated_at,
  po.po_number,
  po.supplier_id,
  po.status                    AS purchase_order_status
FROM      public.purchase_order_items poi
JOIN      public.purchase_orders      po
  ON      po.id = poi.purchase_order_id
  AND     po.tenant_id = poi.tenant_id
LEFT JOIN public.rolls               r
  ON      r.purchase_order_item_id = poi.id
  AND     r.tenant_id = poi.tenant_id
  AND     r.deleted_at IS NULL
WHERE     poi.quantity_received_sqm > 0
  AND     poi.deleted_at IS NULL
  AND     po.deleted_at IS NULL
GROUP BY  poi.id, poi.purchase_order_id, poi.tenant_id, poi.line_number,
          poi.material_type_id, poi.quantity_received_sqm, poi.received_date,
          poi.updated_at, po.po_number, po.supplier_id, po.status
HAVING    COUNT(r.id) = 0;

COMMENT ON VIEW po_receipts_pending_roll_creation IS
  'Step 7b reconciliation surface: PO items with quantity_received_sqm > 0 that have NO matching rolls (via rolls.purchase_order_item_id). Populated when the receive-PO use-case persisted the PO write but a downstream rollService.createRoll call failed and was logged into failedItemIds. RLS-tenant-scoped via the underlying tables. An admin/worker should reconcile these by either creating the missing rolls (using the captured failedItemIds) or rolling back the receipt.';

GRANT SELECT ON po_receipts_pending_roll_creation TO authenticated, service_role;
