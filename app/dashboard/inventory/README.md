# inventory/

Inventory management pages for viewing, adding, importing, and managing rubber rolls.

## Files

- **page.tsx** -- Main inventory page: roll table with search, add/edit dialogs, CSV import, and export actions (RBAC-gated)

## Subdirectories

### import/

CSV bulk import flow for rolls.

- **page.tsx** -- Import wizard page
- **\_components/import-upload-card.tsx** -- File upload dropzone for CSV files
- **\_components/import-template-card.tsx** -- Download CSV template card
- **\_components/import-review-card.tsx** -- Review parsed data before committing the import

### purchase-orders/

Purchase order management within inventory.

- **page.tsx** -- PO list page with create/edit/view capabilities
- **\_components/po-table.tsx** -- Sortable, filterable PO data table with context-aware status actions
- **\_components/po-create-dialog.tsx** -- Create new PO dialog
- **\_components/po-edit-dialog.tsx** -- Edit existing PO dialog
- **\_components/po-form-dialog.tsx** -- Shared PO form layout (used by create and edit)
- **\_components/po-view-dialog.tsx** -- Read-only PO detail view
- **\_components/po-view-sections.tsx** -- Sub-sections rendered inside the PO detail view
- **\_components/po-action-handlers.ts** -- PO action logic (approve, reject, cancel, receive)
- **\_components/po-pdf-export.ts** -- Generate PDF export of a purchase order
- **\_components/po-tax-helpers.ts** -- Tax calculation helpers for PO line items
- **\_components/use-po-actions.ts** -- Hook for PO status transitions
- **\_components/use-po-form-state.ts** -- Hook for PO form state with auto tax detail fetching
- **\_components/use-purchase-orders.ts** -- Composition hook: fetches POs/suppliers/materials, computes stats, composes form state + actions

### reorder/

Automatic reorder management.

- **page.tsx** -- Reorder dashboard with tabs: Rules, Suggestions, Analytics
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
  _materials: MaterialType[],
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
