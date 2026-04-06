# stores/

Zustand state stores for client-side state management. Each store wraps a service layer and exposes actions + loading/error state to React components.

## Files

- **purchaseOrderStore.ts** -- PO state: CRUD, line items, status transitions, receiving, and analytics actions

```typescript
// State interface
interface PurchaseOrderState {
  purchaseOrders: PurchaseOrderWithDetails[]
  selectedPO: PurchaseOrderWithDetails | null
  pendingDeliveries: PurchaseOrderWithDetails[]
  poStats: POStats | null
  isLoading: boolean
  isUpdating: boolean
  isSubmitting: boolean
  isReceiving: boolean
  error: string | null
  // Actions
  fetchPurchaseOrders: () => Promise<void>
  createPO: (order: CreatePurchaseOrder) => Promise<PurchaseOrderWithDetails>
  submitForApproval: (id: string, submittedBy?: string) => Promise<void>
  approvePO: (id: string, approvedBy?: string) => Promise<void>
  receivePO: (id: string, items: Array<{ itemId: string; quantityReceived: number; rollData?: Partial<Roll> }>) => Promise<POReceiptResult>
  // ...
}

// Representative action — createPO with optimistic update:
createPO: async (order: CreatePurchaseOrder) => {
  set({ isUpdating: true, error: null })
  const newPO = await purchaseOrderService.createPurchaseOrder(order)
  set((state) => ({
    purchaseOrders: [newPO, ...state.purchaseOrders],
    selectedPO: newPO,
    isUpdating: false,
  }))
  return newPO
}

// Usage in a component:
// const { purchaseOrders, isLoading, fetchPurchaseOrders } = usePurchaseOrderStore()
// const pos = usePurchaseOrderStore((s) => s.purchaseOrders)
```
- **reorderStore.ts** -- Reorder state: rule management, suggestion generation, auto-PO creation, optimal quantity calculation

```typescript
// State interface
interface ReorderState {
  reorderRules: ReorderRuleWithDetails[]
  activeRules: ReorderRuleWithDetails[]
  selectedRule: ReorderRuleWithDetails | null
  suggestions: ReorderSuggestion[]
  isLoading: boolean
  isUpdating: boolean
  isCheckingReorders: boolean
  isGeneratingPO: boolean
  error: string | null
  // Actions
  fetchReorderRules: () => Promise<void>
  createRule: (rule: CreateReorderRule) => Promise<ReorderRuleWithDetails>
  checkReorderPoints: () => Promise<void>
  generateSuggestions: (includeInactive?: boolean) => Promise<void>
  createPurchaseOrderFromSuggestion: (suggestion: ReorderSuggestion) => Promise<PurchaseOrder>
  // ...
}

// Representative action — creates PO from suggestion and removes it from the list:
createPurchaseOrderFromSuggestion: async (suggestion) => {
  set({ isGeneratingPO: true, error: null })
  const po = await reorderService.createAutomaticPurchaseOrder(suggestion)
  set((state) => ({
    suggestions: state.suggestions.filter((s) => s.materialTypeId !== suggestion.materialTypeId),
    isGeneratingPO: false,
  }))
  return po
}

// Usage:
// const { suggestions, checkReorderPoints } = useReorderStore()
```
- **supplierStore.ts** -- Supplier state: CRUD, material-supplier linking, preferred supplier management, price history tracking

```typescript
// State interface
interface SupplierState {
  suppliers: Supplier[]
  activeSuppliers: Supplier[]
  preferredSuppliers: Supplier[]
  materialSuppliers: MaterialSupplierWithDetails[]
  selectedSupplier: Supplier | null
  isLoading: boolean
  isUpdating: boolean
  error: string | null
  // Actions
  fetchSuppliers: () => Promise<void>
  createSupplier: (supplier: CreateSupplier) => Promise<Supplier>
  linkMaterialToSupplier: (ms: CreateMaterialSupplier) => Promise<MaterialSupplierWithDetails>
  setPreferredSupplier: (materialTypeId: string, supplierId: string) => Promise<MaterialSupplierWithDetails>
  updateMaterialPrice: (materialSupplierId: string, newPrice: number, reason?: string) => Promise<void>
  // ...
}

// Representative action — updateMaterialPrice (tracks history, then updates):
updateMaterialPrice: async (materialSupplierId, newPrice, reason?, changedBy?) => {
  set({ isUpdating: true, error: null })
  const currentMS = get().materialSuppliers.find((ms) => ms.id === materialSupplierId)
  await priceHistoryService.trackPriceChange(materialSupplierId, currentMS?.cost_per_sqft, newPrice, reason, changedBy)
  const updated = await supplierService.updateMaterialSupplier(materialSupplierId, { cost_per_sqft: newPrice, effective_date: new Date().toISOString() })
  set((state) => ({
    materialSuppliers: state.materialSuppliers.map((ms) => ms.id === materialSupplierId ? updated : ms),
    isUpdating: false,
  }))
}

// Usage:
// const { suppliers, isLoading } = useSupplierStore()
```

## preferences/

- **preferences-store.ts** -- Zustand vanilla store for user preferences (theme, font, sidebar layout, content width)

```typescript
export type PreferencesState = {
  themeMode: ThemeMode
  resolvedThemeMode: ResolvedThemeMode
  themePreset: ThemePreset
  font: FontKey
  contentLayout: ContentLayout
  navbarStyle: NavbarStyle
  sidebarVariant: SidebarVariant
  sidebarCollapsible: SidebarCollapsible
  setThemeMode: (mode: ThemeMode) => void
  setFont: (font: FontKey) => void
  // ... setters for each preference
  isSynced: boolean
}

export const createPreferencesStore = (init?: Partial<PreferencesState>) =>
  createStore<PreferencesState>()((set) => ({
    themeMode: init?.themeMode ?? PREFERENCE_DEFAULTS.theme_mode,
    // ... defaults from PREFERENCE_DEFAULTS
    setThemeMode: (mode) => set({ themeMode: mode }),
    setFont: (font) => set({ font }),
    // ...
  }))
```
- **preferences-provider.tsx** -- React context provider that hydrates the preferences store from cookies/DOM and syncs changes

```typescript
// Provider — wraps children with Zustand store context
export const PreferencesStoreProvider = ({ children, themeMode, themePreset, font, contentLayout, navbarStyle }: Props) => {
  const [store] = useState(() => createPreferencesStore({ themeMode, themePreset, font, contentLayout, navbarStyle }))
  // On mount: reads DOM attributes (data-theme-mode, data-font, etc.) and syncs to store
  // Subscribes to system theme changes when themeMode === "system"
  return <PreferencesStoreContext.Provider value={store}>{children}</PreferencesStoreContext.Provider>
}

// Hook — typed selector into the preferences store
export const usePreferencesStore = <T,>(selector: (state: PreferencesState) => T): T => {
  const store = useContext(PreferencesStoreContext)
  if (!store) throw new Error("Missing PreferencesStoreProvider")
  return useStore(store, selector)
}

// Usage:
// const themeMode = usePreferencesStore((s) => s.themeMode)
// const setFont = usePreferencesStore((s) => s.setFont)
```
