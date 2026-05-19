-- ═══════════════════════════════════════════════════════════════════════════
-- Step 7c-1 — PO-receipt reconciliation views
-- ═══════════════════════════════════════════════════════════════════════════
-- The `ReceivePurchaseOrderUseCase` orchestrates two writes per receipt
-- delta:
--   (1) the PO aggregate's `quantity_received_sqm` increment via
--       `recordReceipt(lineNumber, …)` on the entity
--   (2) zero-or-more `rolls` inserts that materialize the received
--       material into queryable inventory
--
-- Step 7c-1 reframes the persistence path as receipt-row-first:
--   • INSERT po_item_receipts (idempotency_key) ON CONFLICT DO NOTHING
--   • If fresh, apply entity recordReceipt + repo.update(po)
--   • Stamp applied_at after repo.update succeeds
--   • For roll_requested rows: call rollService.createRoll
--   • Stamp roll_created_at after createRoll succeeds
--
-- Two race windows survive that flow; each gets its own reconciliation
-- surface so an admin / worker can backfill:
--
--   View A — po_receipts_pending_apply:
--     Receipt INSERT succeeded but the PO persistence failed before
--     applied_at could be stamped. Same-key retry hits ON CONFLICT and
--     skips the apply again → PO is permanently under-received until an
--     admin replays the apply (using the receipt's quantity_received_sqm
--     as the source of truth).
--
--   View B — po_receipts_pending_roll_creation (rewritten from 7b):
--     Receipt applied successfully, operator requested a roll, but
--     `rollService.createRoll` failed or its stamp never persisted.
--     A NOT EXISTS clause against `rolls.purchase_order_item_id`
--     prevents stale-stamp rows (createRoll succeeded but the stamp
--     write didn't) from being surfaced as needing action — the data
--     is correct, only the marker is stale.
--
-- Both views run as `WITH (security_invoker = true)` so RLS evaluates
-- against the caller's JWT — tenant scoping carries through the join
-- chain. Without security_invoker the views would default to
-- SECURITY DEFINER (run as the view owner) and the GRANTs below would
-- leak rows across tenants. Caught in 7b pre-flight review; reaffirmed
-- in 7c-1 design.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── po_receipts_pending_apply ─────────────────────────────────────────────
-- Receipt row landed, PO `quantity_received_sqm` was never incremented.

CREATE OR REPLACE VIEW po_receipts_pending_apply
WITH (security_invoker = true) AS
SELECT
  pir.id                       AS receipt_id,
  pir.tenant_id,
  pir.purchase_order_item_id,
  pir.idempotency_key,
  pir.quantity_received_sqm,
  pir.received_date,
  pir.created_at               AS receipt_created_at,
  pir.created_by               AS receipt_created_by,
  poi.purchase_order_id,
  poi.line_number,
  poi.material_type_id,
  po.po_number,
  po.supplier_id,
  po.status                    AS purchase_order_status
FROM      public.po_item_receipts        pir
JOIN      public.purchase_order_items    poi
  ON      poi.id = pir.purchase_order_item_id
  AND     poi.tenant_id = pir.tenant_id
JOIN      public.purchase_orders         po
  ON      po.id = poi.purchase_order_id
  AND     po.tenant_id = poi.tenant_id
WHERE     pir.applied_at IS NULL
  AND     poi.deleted_at IS NULL
  AND     po.deleted_at IS NULL;

COMMENT ON VIEW po_receipts_pending_apply IS
  'Step 7c-1 reconciliation surface for under-applied receipts: receipt rows where applied_at IS NULL. Indicates the rare race where the receipt INSERT committed but the subsequent purchase_order_items update did not. Admin replay re-runs recordReceipt(lineNumber, quantity_received_sqm) on the entity and stamps applied_at. RLS-tenant-scoped via the underlying tables.';

GRANT SELECT ON po_receipts_pending_apply TO authenticated, service_role;


-- ─── po_receipts_pending_roll_creation ─────────────────────────────────────
-- Receipt applied, operator requested a roll, but no roll materialized.
-- NOT EXISTS guard against rolls handles the stale-stamp case where
-- createRoll succeeded but its roll_created_at stamp never persisted.

CREATE OR REPLACE VIEW po_receipts_pending_roll_creation
WITH (security_invoker = true) AS
SELECT
  pir.id                       AS receipt_id,
  pir.tenant_id,
  pir.purchase_order_item_id,
  pir.idempotency_key,
  pir.quantity_received_sqm,
  pir.received_date,
  pir.roll_width_mm,
  pir.roll_length_mm,
  pir.roll_thickness_mm,
  pir.roll_color,
  pir.roll_location,
  pir.roll_cost_per_sqm_cents,
  pir.roll_notes,
  pir.created_at               AS receipt_created_at,
  pir.created_by               AS receipt_created_by,
  poi.purchase_order_id,
  poi.line_number,
  poi.material_type_id,
  po.po_number,
  po.supplier_id,
  po.status                    AS purchase_order_status
FROM      public.po_item_receipts        pir
JOIN      public.purchase_order_items    poi
  ON      poi.id = pir.purchase_order_item_id
  AND     poi.tenant_id = pir.tenant_id
JOIN      public.purchase_orders         po
  ON      po.id = poi.purchase_order_id
  AND     po.tenant_id = poi.tenant_id
WHERE     pir.applied_at IS NOT NULL
  AND     pir.roll_requested = true
  AND     pir.roll_created_at IS NULL
  AND     poi.deleted_at IS NULL
  AND     po.deleted_at IS NULL
  AND     NOT EXISTS (
            SELECT 1
              FROM public.rolls r
             WHERE r.purchase_order_item_id = pir.purchase_order_item_id
               AND r.tenant_id = pir.tenant_id
               AND r.deleted_at IS NULL
          );

COMMENT ON VIEW po_receipts_pending_roll_creation IS
  'Step 7c-1 reconciliation surface for missing rolls: receipt rows where applied_at IS NOT NULL, roll_requested = true, roll_created_at IS NULL, and no matching roll exists via rolls.purchase_order_item_id. Admin replay reads the typed roll-intent columns and calls rollService.createRoll. NOT EXISTS clause against rolls filters out stale-stamp rows (createRoll succeeded but stamp lost). RLS-tenant-scoped via the underlying tables.';

GRANT SELECT ON po_receipts_pending_roll_creation TO authenticated, service_role;
