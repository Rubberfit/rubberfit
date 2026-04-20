# S3c plan review — Gemini

## Verdict: conditional sign-off

The S3c plan is architecturally sound and follows the established pattern from S3b. The use of Postgres RPCs for transactional writes is a pragmatic and robust choice for cross-aggregate atomicity. However, there are a few critical concurrency and logic issues that need to be addressed before execution.

## Required changes

### 1. Fix `generate_po_number()` race condition
As suspected, the current implementation in `src/infrastructure/supabase/migrations/20240219000005_create_purchase_orders_table.sql` uses `SELECT MAX(...) + 1`. While the `UNIQUE` constraint on `po_number` prevents duplicate entries, it will cause 409/500 errors in Task 2 and Task 7 if two POs are created simultaneously (especially during auto-reorder checks from multiple API instances).
- **Change:** Port `generate_po_number` to use a Postgres sequence object. Since it's a per-year format (`PO-YY-NNNN`), the function should check if the sequence for the current year exists, create it if not, and then call `nextval()`. This ensures race-safety without relying on `MAX()`.

### 2. Lock PO row in `receive_purchase_order` RPC
Task 5 introduces the `receive_purchase_order` RPC. To prevent race conditions where two users might attempt to receive items for the same PO simultaneously, or a header update conflicts with the receive flow:
- **Change:** The RPC body must start with `SELECT 1 FROM purchase_orders WHERE id = po_id FOR UPDATE`. This ensures the transaction holds a row-level lock before performing the multi-table updates (items, rolls, and PO status).

### 3. Handle `INVALID_STATE_TRANSITION` in UI
Task 3 returns a 409 error for invalid status transitions.
- **Change:** Ensure the UI (Task 11a) specifically handles this 409 to show the "allowed targets" provided by the backend, rather than a generic error message. This is critical for the "draft -> pending -> approved" flow.

## Nice-to-haves / follow-ups

- **Tax calculation:** Moving this to `rf-application::tax` is a good decision for future cross-cutting use (quotes/invoices). Verify if Avalara integration is planned for the "external integrations" phase, as the current port is a pure DB lookup.
- **CSV review JSON shape:** Ensure the JSON shape sent from the browser in Task 11c matches the bulk-insert shape used by the Rust backend for rolls. This maximizes code reuse in the `rolls` adapter.
- **Lineage tracking:** The `reorder_rule_id` on `purchase_orders` is sufficient for basic lineage. Consider adding a comment in the domain model clarifying that this is the primary way to track "triggered" vs "manual" POs.

## Things I looked at that are fine

- **Domain modeling:** Treating `PurchaseOrder` and `PurchaseOrderItem` as separate aggregates works well given the RPC-based receive flow and the need for individual item CRUD.
- **Reorder Rule ↔ PO coupling:** `SET NULL` on rule delete is safe and appropriate.
- **Status Enum:** Using use-case layer enforcement for the state machine (Task 3) is simpler and more maintainable than complex Rust type-state for this scale.
- **Postgres RPCs:** Adding specific logic functions for atomicity is a justified exception to the "no schema changes" goal, as it fixes a fundamental data integrity risk in the legacy sequential-write pattern.

## Questions for Claude

- **Auto-reorder background job:** The `auto_reorder` flag is currently "inert" (UI-only). Is there a plan to eventually move the `daily_reorder_check()` trigger into a Rust-based background worker, or will it stay as a Postgres CRON?
- **CSV Audit:** Since the original CSV bytes aren't stored, how will we troubleshoot "why did this import go wrong" once the temporary browser state is gone?
- **Concurrency in Task 7:** Does `create_reorder_purchase_order` also lock the `reorder_rules` row to prevent double-triggering if two instances run the check simultaneously?
