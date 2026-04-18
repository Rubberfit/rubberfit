# services/

Supabase API wrappers and business logic services. Each file encapsulates all database operations for a specific domain.

## Files

- **authService.ts** -- Authentication (sign in, sign up, sign out, password reset, OAuth, session management)

```typescript
export const authService = {
  async signIn(email: string, password: string): Promise<AuthResponse> { /* ... */ },
  async signUp(email: string, password: string): Promise<AuthResponse> { /* ... */ },
  async signOut(): Promise<{ error: AuthError | null }> { /* ... */ },
  async resetPassword(email: string): Promise<{ error: AuthError | null }> { /* ... */ },
  async updatePassword(password: string): Promise<AuthResponse> { /* ... */ },
  async getCurrentUser(): Promise<AuthUser | null> { /* ... */ },
  async getSession() { /* ... */ },
  onAuthStateChange(callback: (user: AuthUser | null) => void) { /* ... */ },
}

// Representative method:
async signIn(email: string, password: string): Promise<AuthResponse> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { user: null, error }
  const avatar = data.user.user_metadata?.avatar_url
    || data.user.user_metadata?.picture
    || generateRandomAvatar(data.user.email!)
  return {
    user: { id: data.user.id, email: data.user.email!, name: /* ... */, avatar, roles: await getProfileRoles(data.user.id) },
    error: null,
  }
}
```

- **rollService.ts** -- Roll CRUD, search, inventory value calculations, bulk import, low stock detection

```typescript
export const rollService = {
  async getAllRolls() { /* ... */ },
  async getActiveRolls() { /* ... */ },
  async getRollById(id: string) { /* ... */ },
  async addRoll(roll: Omit<Roll, "id" | "user_id" | "created_at" | "updated_at">) { /* ... */ },
  async updateRoll(id: string, updates: Partial<Roll>) { /* ... */ },
  async searchRolls(query: string) { /* ... */ },
  async getInventoryValue() { /* ... */ },
  async getLowStockCount() { /* ... */ },
  async bulkAddRolls(rolls: Omit<Roll, "id" | "user_id" | "created_at" | "updated_at">[], batchSize = 50) { /* ... */ },
  // ...
}

// Representative method — inventory value calculation:
async getInventoryValue() {
  const { data, error } = await supabase
    .from("rolls")
    .select("width, remaining_length, cost_per_sqft")
    .eq("status", "active")
  if (error) throw error
  return data.reduce((sum, roll) => {
    const sqft = (roll.width * roll.remaining_length) / 144
    return sum + sqft * (roll.cost_per_sqft || 0)
  }, 0)
}
```

- **cutService.ts** -- Cut recording, history retrieval, waste statistics, optimization (best roll selection)

```typescript
export const cutService = {
  async recordCut(cut: Omit<Cut, "id" | "user_id" | "created_at">) { /* ... */ },
  async getCutHistory(limit = 100) { /* ... */ },
  async getWasteStats() { /* ... */ },
  async optimizeCut(requirements: { materialType: string; width: number; length: number; quantity: number; thickness?: number }) { /* ... */ },
  // ...
}

// Representative method — records a cut and updates the roll's remaining length:
async recordCut(cut: Omit<Cut, "id" | "user_id" | "created_at">) {
  const user_id = await getCurrentUserId()
  const { data, error } = await supabase
    .from("cuts").insert([{ ...cut, user_id }]).select().single()
  if (error) throw error
  if (cut.roll_id) {
    const { data: roll } = await supabase
      .from("rolls").select("remaining_length").eq("id", cut.roll_id).single()
    if (roll) {
      const newLength = roll.remaining_length - cut.cut_length * cut.quantity
      await supabase.from("rolls").update({
        remaining_length: Math.max(0, newLength),
        status: newLength <= 0 ? "depleted" : "active",
      }).eq("id", cut.roll_id)
    }
  }
  return data as Cut
}
```

- **materialTypeService.ts** -- Material type CRUD and lookup by ID/name/cost

```typescript
export const materialTypeService = {
  async getAll() {
    /* ... */
  },
  async getByIds(ids: string[]) {
    /* ... */
  },
  async getNames() {
    /* returns Pick<MaterialType, "id" | "name">[] */
  },
  async getTopByCost(limit: number) {
    /* ... */
  },
  async create(material: Omit<MaterialType, "id" | "user_id" | "created_at" | "updated_at">) {
    /* ... */
  },
  async update(id: string, updates: Partial<MaterialType>) {
    /* ... */
  },
  async delete(id: string) {
    /* ... */
  },
}
```

- **supplierService.ts** -- Supplier CRUD, material-supplier linking, preferred supplier management, search

```typescript
export const supplierService = {
  async getAllSuppliers() { /* ... */ },
  async getActiveSuppliers() { /* ... */ },
  async getPreferredSuppliers() { /* ... */ },
  async createSupplier(supplier: CreateSupplier) { /* ... */ },
  async linkMaterialToSupplier(materialSupplier: CreateMaterialSupplier) { /* ... */ },
  async setPreferredSupplier(materialTypeId: string, supplierId: string) { /* ... */ },
  async searchSuppliers(query: string) { /* ... */ },
  // ...
}

// Representative method — sets preferred supplier (unsets others first):
async setPreferredSupplier(materialTypeId: string, supplierId: string) {
  await supabase.from("material_suppliers")
    .update({ preferred_supplier: false })
    .eq("material_type_id", materialTypeId)
  const { data, error } = await supabase.from("material_suppliers")
    .update({ preferred_supplier: true })
    .eq("material_type_id", materialTypeId)
    .eq("supplier_id", supplierId)
    .select(`*, material_type:material_types(id, name), supplier:suppliers(id, name)`)
    .single()
  if (error) throw error
  return data as MaterialSupplierWithDetails
}
```

- **purchaseOrderService.ts** -- PO CRUD, line item management, status transitions (draft -> approved -> received), PO number generation

```typescript
export const purchaseOrderService = {
  async getAllPurchaseOrders() { /* ... */ },
  async createPurchaseOrder(order: CreatePurchaseOrder) { /* ... */ },
  async addItemToPurchaseOrder(item: CreatePurchaseOrderItem) { /* ... */ },
  async updatePurchaseOrderStatus(id: string, newStatus: PurchaseOrder["status"], changedBy?: string) { /* ... */ },
  async receivePurchaseOrder(id: string, items: Array<{ itemId: string; quantityReceived: number; rollData?: Partial<Roll> }>, receivedBy?: string) { /* ... */ },
  async generatePONumber(): Promise<string> { /* ... */ },
  // ...
}

// Status transition validation:
isValidStatusTransition(from: PurchaseOrder["status"], to: PurchaseOrder["status"]): boolean {
  const validTransitions: Record<PurchaseOrder["status"], PurchaseOrder["status"][]> = {
    draft: ["pending", "cancelled"],
    pending: ["approved", "draft", "cancelled"],
    approved: ["ordered", "cancelled"],
    ordered: ["received", "cancelled"],
    received: [],
    cancelled: ["draft"],
  }
  return validTransitions[from]?.includes(to) || false
}
```

- **purchaseOrderAnalytics.ts** -- PO receiving logic, stats aggregation, supplier purchase history, pending deliveries

```typescript
export const purchaseOrderAnalytics = {
  async receivePurchaseOrder(id, items, receivedBy, updateStatus) { /* ... */ },
  async getPurchaseOrderStats() { /* ... */ },
  async getSupplierPurchaseHistory(supplierId: string, limit = 10) { /* ... */ },
  async getPendingDeliveries() { /* ... */ },
}

// Representative method — stats aggregation:
async getPurchaseOrderStats() {
  const { data, error } = await supabase.from("purchase_orders").select("status, total_amount")
  if (error) throw error
  const stats = { total: data?.length || 0, byStatus: {} as Record<string, number>, totalValue: 0, avgOrderValue: 0 }
  data?.forEach((po) => {
    stats.byStatus[po.status] = (stats.byStatus[po.status] || 0) + 1
    stats.totalValue += po.total_amount || 0
  })
  stats.avgOrderValue = stats.totalValue / (data?.length || 1)
  return stats
}
```

- **reorderService.ts** -- Reorder rule CRUD, reorder point checking, suggestion generation, auto-PO creation

```typescript
export interface ReorderSuggestion {
  materialTypeId: string
  materialName: string
  currentStock: number
  reorderPoint: number
  suggestedQuantity: number
  supplierId?: string
  estimatedCost: number
  urgency: "critical" | "high" | "normal" | "low"
  reason: string
}

export const reorderService = {
  async getAllReorderRules() {
    /* ... */
  },
  async createReorderRule(rule: CreateReorderRule) {
    /* ... */
  },
  async checkReorderPoints(): Promise<ReorderSuggestion[]> {
    /* ... */
  },
  async generateReorderSuggestions(includeInactive?: boolean): Promise<ReorderSuggestion[]> {
    /* ... */
  },
  async createAutomaticPurchaseOrder(suggestion: ReorderSuggestion) {
    /* ... */
  },
  // ...
}
```

- **reorderCalculations.ts** -- EOQ calculation, cost estimation, stock level math, urgency determination

```typescript
export const reorderCalculations = {
  async calculateOptimalOrderQuantity(materialTypeId: string, supplierId?: string): Promise<OptimalOrderQuantity> { /* ... */ },
  async calculateCurrentStock(materialTypeId: string): Promise<number> { /* ... */ },
  calculateSuggestedQuantity(currentStock, reorderPoint, reorderQuantity, maxStock?) { /* ... */ },
  determineUrgency(currentStock, reorderPoint, safetyStockDays) { /* ... */ },
  // ...
}

// Representative method — EOQ calculation:
// annualDemand = avgDailyUsage * 365
// eoq = sqrt((2 * annualDemand * orderingCost) / holdingCost)
// optimalQuantity = max(100, round(eoq / 100) * 100)

// Urgency determination:
determineUrgency(currentStock, reorderPoint, _safetyStockDays) {
  const stockRatio = currentStock / reorderPoint
  if (currentStock === 0) return "critical"
  if (stockRatio <= 0.25) return "high"
  if (stockRatio <= 0.5) return "normal"
  return "low"
}
```

- **priceHistoryService.ts** -- Price change tracking, trend analysis, cross-supplier price comparison, best-price lookup

```typescript
export const priceHistoryService = {
  async trackPriceChange(materialSupplierId, oldPrice, newPrice, changeReason?, changedBy?) { /* ... */ },
  async getPriceHistory(materialSupplierId: string, limit?: number) { /* ... */ },
  async comparePrices(materialTypeId: string) { /* ... */ },
  async calculatePriceTrends(materialTypeId: string, daysBack = 30): Promise<PriceTrend[]> { /* ... */ },
  async getBestPrice(materialTypeId: string): Promise<BestPriceOption | null> { /* ... */ },
  calculateValueScore(supplier: MaterialSupplierWithDetails): number { /* ... */ },
  // ...
}

// Value score — balances price, lead time, rating, and preferred status:
calculateValueScore(supplier: MaterialSupplierWithDetails): number {
  const priceScore = 100 / (supplier.cost_per_sqft + 1)
  const leadTimeScore = 100 / ((supplier.lead_time_days || 1) + 1)
  const ratingScore = (supplier.supplier?.rating || 3) * 20
  const preferredBonus = supplier.preferred_supplier ? 20 : 0
  return priceScore + leadTimeScore + ratingScore + preferredBonus
}
```

- **taxService.ts** -- Tax rate resolution (cache -> API -> DB fallback), tax calculation for POs, supplier exemption checks

```typescript
export const taxService = {
  async getTaxRateForLocation(state?, city?, zipCode?): Promise<TaxRateDetails> { /* ... */ },
  async calculateTax(subtotal, state?, city?, zipCode?): Promise<TaxCalculation> { /* ... */ },
  async calculatePurchaseOrderTax(supplierId: string, subtotal: number): Promise<TaxCalculation> { /* ... */ },
  async isSupplierTaxExempt(supplierId: string): Promise<boolean> { /* ... */ },
  // ...
}

// Fallback chain: cached DB rate -> Ziptax API -> state rate -> 8% default
async getTaxRateForLocation(state?, city?, zipCode?): Promise<TaxRateDetails> {
  if (!state && !zipCode) return DEFAULT_TAX  // { tax_rate: 0.08, tax_name: "Default Tax Rate (8%)" }
  const cached = await resolveTaxFromCache(stateCode, city, zipCode)
  if (cached) return cached
  if (zipCode) { const apiResult = await resolveTaxFromApi(zipCode, ...); if (apiResult) return apiResult }
  const dbFallback = await resolveTaxFromDbFallback(stateCode, city, zipCode)
  return dbFallback ?? DEFAULT_TAX
}
```

- **taxApiService.ts** -- External tax rate API client with in-memory cache (lookup by ZIP code)

```typescript
export interface TaxApiResult {
  totalRate: number
  rates: TaxRateBreakdown[]
  postalCode: string
  city?: string
  state?: string
  county?: string
}

const memoryCache = new Map<string, { data: TaxApiResult; timestamp: number }>()
const MEMORY_CACHE_TTL = 30 * 60 * 1000 // 30 minutes

export const taxApiService = {
  async getTaxRateByZip(postalCode: string): Promise<TaxApiResult | null> {
    const zip5 = postalCode.trim().substring(0, 5)
    const cached = memoryCache.get(zip5)
    if (cached && Date.now() - cached.timestamp < MEMORY_CACHE_TTL) return cached.data
    const response = await fetch(`/api/tax-rates?postalCode=${zip5}`)
    // ...
  },
  clearCache() {
    memoryCache.clear()
  },
}
```

- **notificationService.ts** -- Multi-channel notification dispatch (in-app, email), user preference checking, queue processing

```typescript
class NotificationService {
  async initialize(): Promise<void> { /* loads preferences, starts queue processor */ }
  async sendNotification(params: NotificationParams): Promise<void> { /* ... */ }
  async sendLowStockAlert(params: { userIdentifier; materialName; currentStock; reorderPoint }) { /* ... */ }
  async sendPriceChangeAlert(params: { /* ... */ }) { /* ... */ }
  async sendPOStatusUpdate(params: { /* ... */ }) { /* ... */ }
  async updateUserPreferences(userIdentifier: string, preferences: Partial<NotificationPreferences>) { /* ... */ }
  // ...
}
const notificationService = new NotificationService()
export default notificationService

// Dispatch logic — checks preferences, quiet hours, then routes to channels:
async sendNotification(params: NotificationParams): Promise<void> {
  const preferences = await this.getUserPreferences(params.userIdentifier)
  channels.inApp = true // always
  channels.email = !this.isInQuietHours(preferences) || params.priority === "critical"
  if (channels.inApp) this.showInAppNotification(params)
  if (channels.email || channels.sms) await this.queueNotification({ ...params, sendEmail: channels.email })
}
```

- **notificationCrudService.ts** -- Notification record CRUD (create, read, mark read, bulk delete)

```typescript
export const notificationCrudService = {
  async getAll() {
    /* returns Notification[] ordered by created_at desc */
  },
  async getUnreadCount() {
    /* returns number */
  },
  async create(notification: Omit<Notification, "id" | "created_at" | "updated_at">) {
    /* ... */
  },
  async markAsRead(id: string) {
    return this.update(id, { is_read: true })
  },
  async markAllAsRead() {
    /* updates all is_read=false to true */
  },
  async deleteByIds(ids: string[]) {
    /* ... */
  },
  async deleteAll() {
    /* ... */
  },
}
```

- **emailService.ts** -- Email sending via Resend (low stock alerts, PO updates, daily digests, queue processing)

```typescript
class EmailService {
  async sendEmail(
    options: EmailOptions
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    /* ... */
  }
  async sendLowStockAlert(params: { to; materialName; currentStock; reorderPoint }) {
    /* ... */
  }
  async sendPriceChangeAlert(params: { /* ... */ }) {
    /* ... */
  }
  async sendPOStatusUpdate(params: { /* ... */ }) {
    /* ... */
  }
  async sendDailyDigest(params: { /* ... */ }) {
    /* ... */
  }
  async processEmailQueue(): Promise<void> {
    /* fetches pending, processes with retry + exponential backoff */
  }
}
const emailService = new EmailService()
export default emailService
```

- **csvService.ts** -- CSV parsing, validation, roll import, and template generation

```typescript
export const csvService = {
  parseCSV(csvText: string): CSVRow[] {
    /* splits lines, maps headers to rows */
  },
  transformToRolls(csvRows: CSVRow[]): Partial<Roll>[] {
    /* validates required fields, parses numbers */
  },
  async uploadRolls(rolls: Partial<Roll>[]) {
    /* auto-creates missing material_types, then inserts */
  },
  async processCSVFile(file: File) {
    /* end-to-end: parse -> transform -> upload */
  },
  generateTemplate(): string {
    /* returns CSV header row */
  },
  downloadTemplate() {
    /* triggers browser download of template CSV */
  },
}
```

- **exportService.ts** -- CSV export for inventory, cut history, waste analysis, and material usage

```typescript
export const exportService = {
  exportToCSV(data: { headers: string[]; rows: (string | number | null)[][]; filename?: string }) {
    // Builds CSV content, creates Blob, triggers browser download
    const csvContent = [headers.join(","), ...rows.map(row => row.map(cell => /* escape commas/quotes */).join(","))].join("\n")
    // ...
  },
  exportInventory(rolls: Record<string, unknown>[]) { /* maps roll fields to CSV columns */ },
  exportCutHistory(cuts: Record<string, unknown>[]) { /* ... */ },
  exportWasteAnalysis(data: Record<string, unknown>[]) { /* ... */ },
  exportMaterialUsage(data: Record<string, unknown>[]) { /* ... */ },
}
```

- **exportPdfService.ts** -- PDF report generation via jsPDF (inventory reports, waste reports)

```typescript
export const exportPdfService = {
  async generatePDFReport(title: string, content: string) {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
    // Parses HTML content, renders headings/paragraphs/tables/metric cards
    // Auto-paginates with checkNewPage(), adds footer
  },
  fallbackPDFDownload(title: string, htmlContent: string) {
    /* strips HTML, saves as .txt */
  },
  async generateInventoryReport(rolls, summary) {
    /* builds HTML template, calls generatePDFReport */
  },
  async generateWasteReport(data, charts?) {
    /* builds HTML template, calls generatePDFReport */
  },
}
```

- **profileService.ts** -- User profile updates and avatar upload to Supabase Storage

```typescript
export const profileService = {
  async updateProfile(userId: string, updates: { name?: string; avatar?: string }) {
    const { data, error } = await supabase.auth.updateUser({
      data: { full_name: updates.name, avatar_url: updates.avatar },
    })
    // ...
  },
  async uploadAvatar(userId: string, file: File) {
    const filePath = `avatars/${userId}-${Math.random()}.${fileExt}`
    await supabase.storage
      .from("avatars")
      .upload(filePath, file, { cacheControl: "3600", upsert: true })
    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(filePath)
    return { success: true, url: publicUrl }
  },
}
```

- **legacyPackingService.ts** -- `IPackingService` implementation that routes to the legacy TS nesting engines. Homogeneous items (single `Part` entry) run through `greedyNfpPack` from `@/nesting/nfp-greedy-placer`; mixed-item requests (2+ `Part` entries) route through `NFPSolver` from `@/nesting/nfp-solver` (GA-based). Both paths are wrapped in contextualized try/catch and mapped back to canonical `Placement`/`BinResult` shapes: mapped `Placement.shapeId` is always the canonical input id (the mixed path strips NFPSolver's `${shapeId}-${i}` suffix), `instanceIndex` is a per-shape counter (each shape gets `0..quantity-1`), and `legacy.usedArea` / `legacy.occupiedWidth` / `legacy.occupiedHeight` are reused with a `> 0 ? legacy.* : bin.*` fallback so empty-placement results surface bin dimensions rather than 0. On the mixed path, `NestingInput.rotationSteps` is the conservative AND of per-Part `allowRotation` (4 if all parts allow rotation, else 1). `cancel()` is an intentional no-op — legacy sync engines can't be cancelled cooperatively; Task 15 adds real cancellation when multi-bin lands. `onProgress` emits a single `polishing` event with real `elapsedMs = Date.now() - startedAtMs`.

```typescript
@injectable()
export class LegacyPackingService implements IPackingService {
  async pack(request: PackRequest, onProgress?: (p: PackProgress) => void): Promise<PackResult> {
    validateRequest(request) // throws "pack: bins required" / "pack: items required"
    if (isHomogeneous(request.items)) return this.packHomogeneous(request, jobId, onProgress)
    return this.packMixedWithGA(request, jobId, onProgress)
  }
  async cancel(_jobId: string): Promise<void> { /* no-op until Task 15 */ }
}
```

- **useRole.ts** -- React hook for fetching and checking user roles/permissions from Supabase profiles

```typescript
export interface UseRoleReturn {
  roles: AppRole[]
  isLoading: boolean
  userId: string | null
  isAdmin: boolean
  isCutter: boolean
  isManager: boolean
  isSupervisor: boolean
  can: (permission: Permission) => boolean
  hasAnyRole: (required: AppRole[]) => boolean
}

export function useRole(): UseRoleReturn {
  // Fetches roles from supabase profiles table on mount
  // Listens to auth state changes to re-fetch
  // Returns convenience booleans and permission checker
}

// Usage:
// const { isAdmin, can } = useRole()
// if (can("manageRolls")) { /* show admin UI */ }
```
