# inventory/

Inventory management pages for viewing, adding, importing, and managing rubber rolls. Absorbs material catalog management (`materials/`) as of S4 Task 3 — the prior top-level `/dashboard/materials/*` routes 308-redirect here via `next.config.mjs`.

The Jobs-phase pass relocated all roll-specific UI out of `dashboard/_components/` into a colocated `_components/` dir here (see the list below) and introduced the detail drawer + engine deep-link.

**Phase 3 PR 3a (2026-05-06)** -- Added the `<InventoryStatsHero>` (4 StatCards: total active rolls, total sqft, low-stock count, total value), replaced the Export dropdown with a unified "Tools" menu (Export CSV / PDF / Print labels / Import CSV → `/dashboard/inventory/import`), removed the top-of-page CSVUpload card, and migrated `<InventoryTable>` to the shared `<DataTable>` primitive from `@/app/components/patterns/data-table`. Column definitions live in `use-inventory-columns.tsx`; pagination extracted to `table-pagination.tsx`. Roll detail drawer + roll create/edit form-sheet migration is deferred to PR 3b. Locked spec lives at `.claude/handoff/dashboard-phase3-synthesis.md`.

## Files

- **page.tsx** -- Main inventory page. `PageShell` (dense variant) + `PageHeader` with crumbs + Tools dropdown + Add Roll button. `<InventoryStatsHero>` between the header and the table card. `<ViewToolbar>` search above the `<InventoryTable>`. Uses `useRolls` via the table; export handlers run their own SDK call because the summary totals are easier to compute against a freshly-fetched list.

## \_components/

Roll-specific components, colocated with the page they serve.

- **use-rolls.ts** -- `useRolls(searchQuery)` hook — single fetch source for the inventory list. Returns `{ rolls, loading, error, refresh }`. Consumers call `refresh()` when they mutate; the page doesn't have to juggle a numeric refresh key.
- **use-inventory-stats.ts** -- `useInventoryStats(refreshKey)` hook — fetches the active-rolls list and computes the 4 hero metrics (active count, total sqft, low-stock count [stub: 0; wired in PR 3e], total value). Same math as the existing PDF export.
- **inventory-stats-hero.tsx** -- 4-up `<StatCard>` row consuming `useInventoryStats`. Refresh key wires through from the page so post-mutation re-fetch happens automatically.
- **inventory-table.tsx** -- Rolls list, now composing the shared `<DataTable>` + `<TablePagination>`. Row click opens `<RollDetailDrawer>`; each row's kebab dropdown surfaces Edit / Mark Depleted / Delete, each routed through the shared `<AlertDialog>` for destructive flows. The pre-existing `?scan=` deep link still resolves the matching row → drawer.
- **use-inventory-columns.tsx** -- Memoized `<DataTable>` column registry for `<InventoryTable>`. Closes over the action callbacks so the table component stays under the `max-lines-per-function` budget.
- **table-pagination.tsx** -- Shared pagination footer (rows-per-page select + Prev/Next) used by `<InventoryTable>`. Lives here for now; promotion to `app/components/patterns/` is queued for PR 3c (when `<POTable>` adopts the same).
- **roll-form-dialog.tsx** -- Zod-validated add / edit dialog. Wraps `RollFormFields` in a shadcn `Dialog`. Looks up `material_type_id` from the material-type list before submitting so the Rust API's FK requirement is satisfied. (PR 3b migrates this to a right-side `<Sheet>` with Phase 2 form primitives.)
- **roll-form-fields.tsx** -- Shared form body used by both create and edit modes. The supplier dropdown is `SupplierSelect` from `materials/suppliers/_components/supplier-selection`.
- **roll-detail-drawer.tsx** -- Right-docked shadcn `Sheet` that opens on row click. Surfaces the shared `StockSheet` (imported from `cutting-engine/_components/stock-sheet.tsx` — same visual language the engine uses), a three-tile metrics row (% remaining, available sqft, current value), roll metadata, and two actions: Edit (opens `RollFormDialog`) and Open in engine (deep-links via `?loadRoll=<id>`). Also fetches child offcuts (rows where `parent_roll_id = this.id`) and lists them so each spawned offcut is clickable/scannable from the parent's drawer. (PR 3b moves this drawer onto the keyed-target Phase 2 pattern.)

## Subdirectories

### materials/

Material catalog: types, suppliers, pricing. Moved into inventory by S4 Task 3 so all stock-adjacent surfaces live under one root. See `materials/README.md` for detail.

### import/

CSV bulk import flow for rolls.

- **page.tsx** -- Import wizard page. S4 Task 7 polished: `PageShell` (form variant) + `PageHeader` with crumbs; three-step card sequence (Template, Upload, Review) preserved.
- **\_components/import-upload-card.tsx** -- File upload dropzone for CSV files
- **\_components/import-template-card.tsx** -- Download CSV template card
- **\_components/import-review-card.tsx** -- Review parsed data before committing the import

### purchase-orders/

Purchase order management within inventory.

- **page.tsx** -- PO list page. S4 Task 7 polished: `PageShell` (dense) + `PageHeader` with crumbs + Export/New PO actions; 4 `StatCard`s (Total POs with draft/pending chips, Total Value, In Transit, Avg Lead Time); `InlineNotice` when pending approvals > 0; `POTable` in bordered card. All existing create/edit/view/cancel dialogs preserved with `INVALID_STATE_TRANSITION` handling. Issue #122 wired the previously-dead Export action to `PurchaseOrdersExportMenu`.
- **\_components/po-table.tsx** -- Sortable, filterable PO data table with context-aware status actions
- **\_components/po-create-dialog.tsx** -- Create new PO dialog
- **\_components/po-edit-dialog.tsx** -- Edit existing PO dialog
- **\_components/po-form-dialog.tsx** -- Shared PO form layout (used by create and edit)
- **\_components/po-view-dialog.tsx** -- Read-only PO detail view
- **\_components/po-view-sections.tsx** -- Sub-sections rendered inside the PO detail view
- **\_components/po-action-handlers.ts** -- PO action logic (approve, reject, cancel, receive)
- **\_components/po-pdf-export.ts** -- Generate PDF export of a single purchase order (View dialog → Download PDF)
- **\_components/po-export-menu.tsx** -- CSV/PDF dropdown for the page-level header (issue #122). Calls `exportService` + `exportPdfService` via the helpers below; toasts when the filtered PO list is empty.
- **\_components/po-export-utils.ts** -- Pure data shapers (`buildPurchaseOrdersCsv`, `buildPurchaseOrdersPdfHtml`) plus `toPurchaseOrdersExportInput(po)` adapter from the `usePurchaseOrders` hook return shape.
- **\_components/po-tax-helpers.ts** -- Tax calculation helpers for PO line items
- **\_components/use-po-actions.ts** -- Hook for PO status transitions
- **\_components/use-po-form-state.ts** -- Hook for PO form state with auto tax detail fetching
- **\_components/use-purchase-orders.ts** -- Composition hook: fetches POs/suppliers/materials, computes stats, composes form state + actions

### reorder/

Automatic reorder management.

- **page.tsx** -- Reorder dashboard. S4 Task 7 polished: `PageShell` (dense) + `PageHeader` with crumbs; three-tab layout (Rules / Suggestions / Analytics) with existing rules table, suggestion-to-PO flow, and quick stats preserved.
- **\_components/reorder-rules-table.tsx** -- Table with inline editing (click Edit -> Input fields appear in-row -> Save/Cancel)
- **\_components/reorder-rule-modal.tsx** -- Create/edit reorder rule modal
- **\_components/reorder-rule-form-fields.tsx** -- Form fields for reorder rule configuration
- **\_components/reorder-suggestions-table.tsx** -- Table of generated reorder suggestions
- **\_components/reorder-stats-cards.tsx** -- Summary stat cards (active rules, pending suggestions, etc.)
- **\_components/reorder-data-fetcher.ts** -- Loads rules (with current stock), materials, suppliers, and generates suggestions
- **\_components/reorder-po-handlers.ts** -- Creates POs from reorder suggestions

- **\_components/reorder-suggestions.ts** -- Core reorder suggestion algorithm:

```typescript
export interface ReorderSuggestion {
  materialTypeId: string
  materialName: string
  currentStock: number
  reorderPoint: number
  suggestedQuantity: number
  urgencyLevel: "critical" | "high" | "medium" | "low"
  daysUntilStockout: number
  supplierId?: string
  supplierName?: string
  estimatedCost: number
  pendingQuantity?: number
}

export async function generateReorderSuggestions(
  rules: ReorderRuleWithDetails[],
  pendingPOs: Array<{ items?: Array<{ material_type_id: string; quantity_sqft: number }> }>
): Promise<ReorderSuggestion[]> {
  // 1. Calculate effective stock = current stock + pending PO quantities
  // 2. Only suggest when effectiveStock <= reorderPoint
  // 3. Urgency levels by days until stockout:
  //    critical (<=2d), high (<=5d), medium (<=10d), low (>10d)
  // 4. EOQ calculation: sqrt(2 * annualDemand * orderingCost / holdingCost)
  // 5. Resolve preferred supplier via supplierService
  // 6. Sorted by daysUntilStockout ascending
}
```
