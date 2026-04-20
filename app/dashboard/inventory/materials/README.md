# materials/

Materials management pages for material types, suppliers, and pricing. Nested under `inventory/` as of S4 Task 3 (was previously at `app/dashboard/materials/`). Prior paths 308-redirect via `next.config.mjs`.

## Files

- **page.tsx** -- Materials landing. S4 Task 6 polished: `PageShell` + `PageHeader` with crumbs; 4 `StatCard`s (Material types, Avg cost, Alert thresholds, Cost range) with semantic intents; 3 `QuickLinkCard`s routing to Types / Suppliers / Pricing sub-pages; `MaterialTypesOverview` + `SupplierOverview` + `PricingTrends` widget row.

## Subdirectories

### \_components/

Shared components used on the materials overview page.

- **material-types-overview.tsx** -- Summary cards showing material type stats
- **material-types-table.tsx** -- Table listing all material types with inline actions
- **material-type-dialog.tsx** -- Create/edit material type dialog
- **supplier-overview.tsx** -- Supplier summary widget
- **pricing-trends.tsx** -- Pricing trend visualization widget

### pricing/

Price tracking and comparison across suppliers.

- **page.tsx** -- Pricing dashboard with tabs: Price Comparison and Price History (chart + table)
- **\_components/pricing-stats-cards.tsx** -- Summary stat cards (avg price, trends, alerts)
- **\_components/pricing-history-chart.tsx** -- Historical price line chart
- **\_components/pricing-history-table.tsx** -- Tabular price history with filters
- **\_components/pricing-comparison-table.tsx** -- Side-by-side supplier price comparison
- **\_components/pricing-alerts-card.tsx** -- Cards for significant price change alerts (>5%)

- **\_components/pricing-types.ts** -- Core pricing type definitions:

```typescript
export interface PriceHistoryWithJoins extends PriceHistory {
  material_supplier?: MaterialSupplierWithDetails & {
    material_type?: MaterialType
    supplier?: Supplier
  }
}

export interface PriceComparisonData {
  materialTypeId: string
  materialName: string
  suppliers: {
    supplierId: string
    supplierName: string
    currentPrice: number
    leadTime: number
    minOrder: number
    isPreferred: boolean
  }[]
  bestPrice: number
  avgPrice: number
  priceRange: { min: number; max: number }
}

export interface PriceAlert {
  id: string
  materialName: string
  supplierName: string
  oldPrice: number
  newPrice: number
  changePercentage: number
  changeDate: string
  type: "increase" | "decrease"
}
```

- **\_components/pricing-data.ts** -- Data fetching and alert generation:

```typescript
export async function fetchPricingData(dateRange: string): Promise<{
  materialTypes: MaterialType[]
  suppliers: Supplier[]
  materialSuppliers: MaterialSupplierWithDetails[]
  priceHistory: PriceHistoryWithJoins[]
  priceAlerts: PriceAlert[]
}> {
  // Fetches all pricing data within date range from Supabase
  // Generates alerts for price changes > 5%
}
```

### suppliers/

Supplier management and material-supplier relationships.

- **page.tsx** -- Supplier list with search, preferred/active filters, and detail view
- **\_components/index.ts** -- Barrel export for supplier components
- **\_components/suppliers-table-card.tsx** -- Supplier data table card
- **\_components/supplier-form-modal.tsx** -- Create/edit supplier modal (tabbed: Basic Info, Address, Tax & Shipping, Preferences, Materials)
- **\_components/supplier-form-schema.ts** -- Zod validation schema + `supplierToFormData` / `buildSupplierPayload` helpers
- **\_components/supplier-general-fields.tsx** -- General info form fields (name, contact, etc.)
- **\_components/supplier-address-fields.tsx** -- Address form fields (street, city, state, zip)
- **\_components/supplier-shipping-fields.tsx** -- Shipping/delivery form fields
- **\_components/supplier-preferences-fields.tsx** -- Preference settings form fields
- **\_components/supplier-detail-view.tsx** -- Full supplier detail panel with tabs: Overview, Materials & Pricing, Performance
- **\_components/supplier-overview-tab.tsx** -- Overview tab in supplier detail
- **\_components/supplier-materials-tab.tsx** -- Materials tab in supplier detail
- **\_components/supplier-performance-tab.tsx** -- Performance metrics tab in supplier detail
- **\_components/supplier-linked-materials.tsx** -- List of materials linked to a supplier
- **\_components/supplier-selection.tsx** -- Supplier picker/selector component
- **\_components/material-supplier-link.tsx** -- Material-supplier relationship card
- **\_components/material-supplier-link-form.tsx** -- Form for linking a material to a supplier
- **\_components/material-supplier-preferences.tsx** -- Preferred supplier settings
- **\_components/material-supplier-pricing-section.tsx** -- Pricing section in material-supplier view
- **\_components/material-supplier-selection-section.tsx** -- Supplier selection section
- **\_components/pricing-terms-card.tsx** -- Pricing terms and conditions display

### types/

- **page.tsx** -- Dedicated material types management page
