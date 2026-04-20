# S3b plan review — Gemini

## Verdict: conditional sign-off

The plan is robust and follows the established S3a pattern well. The choice to handle all four inventory aggregates together is correct to avoid cross-backend consistency issues in the UI. I have some specific architectural and implementation refinements to address the race conditions and side effects identified.

## Required changes (if any)
- **Task 4: `setPreferredSupplier` atomicity.** Using two `PATCH` calls in the Rust backend creates a race window where zero or two suppliers could be "preferred" if one update fails or another admin intervenes. Since PostgREST doesn't support transactions, I recommend adding a Task 4.1 to create a Postgres RPC function `set_preferred_supplier(p_material_type_id, p_supplier_id)` and calling that from Rust. This keeps the invariant (`1 material_type == 1 preferred_supplier`) strictly within a DB transaction.
- **Task 4: Price History Side Effects.** The existing TS `linkMaterialToSupplier` (Insert) manually calls `priceHistoryService.trackPriceChange`, while `updateMaterialSupplier` (Update) relies on a Postgres trigger. The Rust implementation should either:
  1. Add an `AFTER INSERT` trigger to the DB to handle the initial price row (cleaner).
  2. Or, explicitly implement the initial `trackPriceChange` call in the Rust use case for Create.
  *Recommendation:* Move the logic into a DB trigger to achieve "Pure port" simplicity in Rust and fix the existing TS bug where `updateMaterialPrice` in the store likely causes double-entries (one from explicit call, one from trigger).

## Nice-to-haves / follow-ups
- **OpenAPI splitting.** I recommend splitting `ApiDoc` now. Create `CutsDoc` and `InventoryDoc` (or per-aggregate if 16 routes feel too noisy) and merge them in `rf-api/src/openapi.rs`.
- **Denormalized `rolls.material_type` Lookup.** In Task 5, the server-side lookup of the `name` string from `material_type_id` is correct. To minimize drift, the Rust domain should treat the `material_type` string column as **read-only** from the client's perspective (ignored if sent in POST/PUT) and always hydrated by the server from the ID.
- **Stats Endpoint Naming.** Prefer the explicit path `/api/v2/inventory/rolls/stats/<metric>` over query parameters. It's more idiomatic for "Aggregates" in a RESTish API and keeps the main `list` handler's query parsing simpler.

## Things I looked at that are fine
- **Domain Modeling:** `MaterialSupplier` is correctly identified as an aggregate root given its independent identity and lifecycle in the UI.
- **Zustand Store:** The `supplierStore.ts` is a clean wrapper. Swapping the service implementation will be low-risk as long as the DTO shapes match (which Task 9 verifies).
- **Sequencing:** The order (MT -> Supplier -> MS -> Roll) correctly respects the FK dependency tree.

## Questions for Claude
- **Soft-delete via FK:** If a user tries to DELETE a `MaterialType` that still has `Rolls` associated with it, Supabase will return a FK violation. Do you want the Rust API to catch this specifically and return a friendly 409 ("Cannot delete material type with existing inventory"), or is a generic 409/500 acceptable for the S3b "Pure port"?
- **Idempotency:** You've deferred it, which is fine for UI actions. But `bulkAddRolls` (Task 5.x) or CSV import (S3c) might need it sooner. Are we okay with potential duplicates on retry for this phase?
