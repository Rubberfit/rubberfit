import { createBrowserClient } from "@supabase/ssr"

// Lazy-init Supabase client.
//
// The client is NOT constructed at module load. Importing this module is a
// no-op w.r.t. env vars — only the first call to `getSupabaseClient()` (or
// the first property access on the `supabase` Proxy) triggers construction
// and env validation. This keeps DI-touching tests import-safe without env
// stubs, and keeps the Tauri build evaluable when env is not baked in at
// module-eval time.
//
// HMR stability: the resolved client is pinned to globalThis in dev so
// hot-reloads reuse a single GoTrue auth instance. Without this, each
// reload creates a new client whose background refresh timer competes
// for the same Web Lock on the auth token, causing authenticated requests
// to hang. In production the dev-only branch is dead-code-eliminated and
// only one client is ever created per page load.

type SupabaseBrowserClient = ReturnType<typeof createBrowserClient>

const globalRef = globalThis as unknown as {
  __supabaseClient?: SupabaseBrowserClient
}

function buildSupabaseClient(): SupabaseBrowserClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase env vars missing: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY"
    )
  }
  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      debug: process.env.NODE_ENV === "development",
    },
  })
}

export function getSupabaseClient(): SupabaseBrowserClient {
  if (globalRef.__supabaseClient) return globalRef.__supabaseClient
  const client = buildSupabaseClient()
  if (process.env.NODE_ENV !== "production") {
    globalRef.__supabaseClient = client
  } else {
    // In prod, still cache on the same slot so repeated getSupabaseClient()
    // calls within a single page load reuse one client.
    globalRef.__supabaseClient = client
  }
  return client
}

// Back-compat: preserve the named `supabase` export. The Proxy forwards all
// property reads to the lazily-resolved client, so existing call sites like
// `supabase.from("rolls")` work identically — they just trigger lazy-init
// on first access instead of at module load.
export const supabase = new Proxy({} as SupabaseBrowserClient, {
  get(_target, prop, receiver) {
    const client = getSupabaseClient()
    const value = Reflect.get(client as object, prop, receiver)
    return typeof value === "function"
      ? (value as (...a: unknown[]) => unknown).bind(client)
      : value
  },
})

// Database Types
export interface MaterialType {
  id: string
  user_id: string
  name: string
  description?: string
  default_cost?: number
  min_stock_alert?: number
  created_at: string
  updated_at: string
}

export interface Roll {
  id: string
  user_id: string
  material_type_id?: string
  material_type: string
  width: number
  length: number
  thickness: number
  color?: string
  location?: string
  date_received?: string
  supplier?: string
  cost_per_sqft?: number
  remaining_length: number
  status: "active" | "depleted" | "reserved"
  notes?: string
  /**
   * Points at the source roll when this row is a reusable offcut
   * spawned by a cut operation. Null on purchased / original rolls.
   */
  parent_roll_id?: string | null
  /** Flags reusable-offcut rows so inventory UI can badge them. */
  is_offcut?: boolean
  /**
   * Human-readable unique identifier (RF-000001, RF-000002, …)
   * assigned by a DB trigger on insert. Shared namespace across
   * originals and offcuts; suitable for barcode labels and
   * shop-floor scanning.
   */
  part_number?: string
  /**
   * Render format of the stored barcode asset. We keep
   * `part_number` as the canonical payload to avoid a redundant
   * second text identifier column.
   */
  barcode_format?: "code128"
  /** Supabase Storage object path of the generated barcode PNG. */
  barcode_asset_path?: string | null
  /** When the current barcode PNG was last generated/uploaded. */
  barcode_generated_at?: string | null
  created_at: string
  updated_at: string
}

export interface Cut {
  id: string
  user_id: string
  roll_id?: string
  cut_width: number
  cut_length: number
  quantity: number
  waste_sqft?: number
  waste_percentage?: number
  total_sqft_used?: number
  job_reference?: string
  cut_by?: string
  notes?: string
  created_at: string
}

// Phase 2 Types - Supplier Management
export interface Supplier {
  id: string
  user_id: string
  name: string
  contact_person?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  state?: string
  zip_code?: string
  country?: string
  website?: string
  tax_id?: string
  payment_terms?: string
  rating?: number
  preferred: boolean
  active: boolean
  notes?: string
  tax_rate?: number
  tax_exempt?: boolean
  default_shipping_cost?: number
  shipping_calculation_type?: "flat" | "weight" | "percentage" | "custom"
  created_at: string
  updated_at: string
}

export interface MaterialSupplier {
  id: string
  user_id: string
  material_type_id: string
  supplier_id: string
  supplier_material_code?: string
  cost_per_sqft: number
  minimum_order_sqft?: number
  lead_time_days?: number
  preferred_supplier: boolean
  active: boolean
  notes?: string
  effective_date: string
  expiration_date?: string
  created_at: string
  updated_at: string
}

export interface PriceHistory {
  id: string
  user_id: string
  material_supplier_id: string
  old_cost_per_sqft?: number
  new_cost_per_sqft: number
  price_change_percentage?: number
  change_reason?: string
  effective_date: string
  changed_by?: string
  notes?: string
  created_at: string
}

// Phase 2 Types - Auto-Reorder System
export interface ReorderRule {
  id: string
  user_id: string
  material_type_id: string
  supplier_id?: string
  reorder_point: number
  reorder_quantity: number
  max_stock_level?: number
  lead_time_days: number
  safety_stock_days: number
  auto_reorder: boolean
  active: boolean
  notes?: string
  last_triggered_at?: string
  created_at: string
  updated_at: string
}

export interface PurchaseOrder {
  id: string
  user_id: string
  po_number: string
  supplier_id: string
  status: "draft" | "pending" | "approved" | "ordered" | "received" | "cancelled"
  order_date?: string
  requested_delivery_date?: string
  actual_delivery_date?: string
  subtotal: number
  tax_amount: number
  shipping_cost: number
  total_amount: number
  payment_terms?: string
  shipping_address?: string
  billing_address?: string
  notes?: string
  created_by?: string
  approved_by?: string
  approved_at?: string
  auto_generated: boolean
  reorder_rule_id?: string
  /** Job this PO was raised for, when the operator came from the job sufficiency check. */
  job_id?: string | null
  created_at: string
  updated_at: string
}

export interface PurchaseOrderItem {
  id: string
  user_id: string
  purchase_order_id: string
  material_type_id: string
  line_number: number
  description: string
  width?: number
  length?: number
  thickness?: number
  color?: string
  quantity_sqft: number
  unit_cost: number
  line_total: number
  quantity_received: number
  received_date?: string
  notes?: string
  created_at: string
  updated_at: string
}

// Phase 2 Types - Notification System
export interface NotificationPreferences {
  id: string
  user_id: string
  user_identifier: string
  email?: string
  phone?: string
  sms_enabled: boolean
  email_enabled: boolean
  low_stock_enabled: boolean
  low_stock_threshold_override?: number
  reorder_triggered_enabled: boolean
  po_created_enabled: boolean
  po_approved_enabled: boolean
  delivery_expected_enabled: boolean
  delivery_overdue_enabled: boolean
  delivery_received_enabled: boolean
  price_change_enabled: boolean
  price_change_threshold: number
  system_maintenance_enabled: boolean
  critical_alerts_enabled: boolean
  quiet_hours_start?: string
  quiet_hours_end?: string
  timezone: string
  active: boolean
  created_at: string
  updated_at: string
}

export interface NotificationQueue {
  id: string
  user_id: string
  user_identifier: string
  notification_type:
    | "low_stock"
    | "reorder_triggered"
    | "po_created"
    | "po_approved"
    | "delivery_expected"
    | "delivery_overdue"
    | "delivery_received"
    | "price_change"
    | "system_maintenance"
    | "critical_alert"
  title: string
  message: string
  send_email: boolean
  send_sms: boolean
  priority: "low" | "normal" | "high" | "critical"
  scheduled_for: string
  status: "pending" | "processing" | "sent" | "failed" | "cancelled"
  email_sent_at?: string
  email_delivered_at?: string
  email_failed_at?: string
  email_error_message?: string
  sms_sent_at?: string
  sms_delivered_at?: string
  sms_failed_at?: string
  sms_error_message?: string
  retry_count: number
  max_retries: number
  next_retry_at?: string
  context_data?: Record<string, unknown>
  created_at: string
  updated_at: string
}

// User profile — mirrors the `profiles` table shape so admin and
// auth layers have a single typed handle on it.
export interface UserProfile {
  id: string
  email: string | null
  full_name: string | null
  avatar_url: string | null
  roles: string[] | null
  super_admin: boolean | null
  is_deleted: boolean | null
  created_at: string
  updated_at: string
}

export type UpdateUserProfile = Partial<
  Pick<UserProfile, "full_name" | "email" | "roles" | "is_deleted" | "super_admin" | "avatar_url">
>

// Extended types for joins and computed fields
export interface MaterialSupplierWithDetails extends MaterialSupplier {
  material_type?: MaterialType
  supplier?: Supplier
}

export interface PurchaseOrderWithDetails extends PurchaseOrder {
  supplier?: Supplier
  items?: PurchaseOrderItem[]
  items_count?: number
}

export interface PurchaseOrderItemWithDetails extends PurchaseOrderItem {
  material_type?: MaterialType
  purchase_order?: PurchaseOrder
}

export interface ReorderRuleWithDetails extends ReorderRule {
  material_type?: MaterialType
  supplier?: Supplier
  current_stock?: number
  stock_status?: "ok" | "low" | "critical"
}

// Utility types for forms and API calls
export type CreateSupplier = Omit<Supplier, "id" | "user_id" | "created_at" | "updated_at">
export type UpdateSupplier = Partial<CreateSupplier>

export type CreateMaterialSupplier = Omit<
  MaterialSupplier,
  "id" | "user_id" | "created_at" | "updated_at"
>
export type UpdateMaterialSupplier = Partial<CreateMaterialSupplier>

export type CreateReorderRule = Omit<
  ReorderRule,
  "id" | "user_id" | "created_at" | "updated_at" | "last_triggered_at"
>
export type UpdateReorderRule = Partial<CreateReorderRule & { last_triggered_at?: string }>

export type CreatePurchaseOrder = Omit<
  PurchaseOrder,
  "id" | "user_id" | "created_at" | "updated_at" | "po_number" | "approved_at"
>
export type UpdatePurchaseOrder = Partial<CreatePurchaseOrder>

export type CreatePurchaseOrderItem = Omit<
  PurchaseOrderItem,
  | "id"
  | "user_id"
  | "created_at"
  | "updated_at"
  | "line_number"
  | "line_total"
  | "quantity_received"
>
export type UpdatePurchaseOrderItem = Partial<CreatePurchaseOrderItem>

export type CreateNotificationPreferences = Omit<
  NotificationPreferences,
  "id" | "user_id" | "created_at" | "updated_at"
>
export type UpdateNotificationPreferences = Partial<CreateNotificationPreferences>

export type CreateNotificationQueue = Omit<
  NotificationQueue,
  "id" | "user_id" | "created_at" | "updated_at" | "retry_count" | "next_retry_at"
>
export type UpdateNotificationQueue = Partial<CreateNotificationQueue>

export interface PartCustomDimensions {
  width?: number
  length?: number
  diameter?: number
  height?: number
  topWidth?: number
  bottomWidth?: number
  innerRadius?: number
  outerRadius?: number
  arcDegrees?: number
}

export interface CutHistory {
  id: number
  user_id: string | null
  /**
   * Inventory roll that sourced this cut, if the engine was
   * opened via `?loadRoll=<id>`. Null for legacy cuts and for
   * cuts where the operator set stock dimensions manually.
   */
  roll_id: string | null
  /**
   * Job this cut fulfilled, if the engine was opened via
   * `?loadJob=<id>` from a job drawer. Null for general-cutter
   * flows and pre-jobs-feature cuts.
   */
  job_id: string | null
  /**
   * Specific job_part this cut corresponds to, when the operator
   * picks a line item. Null when the cut is tied to the job as a
   * whole but not a particular part row.
   */
  job_part_id: string | null
  material_id: number
  part_id: number
  cut_length: number
  cut_width: number
  cut_thickness: number
  part_custom_width: number | null
  part_custom_height: number | null
  part_selected_size: number[] | null
  part_selected_size_text: string[] | null
  part_selected_label: string[] | null
  part_custom_dimensions: PartCustomDimensions[] | null
  cut_amount: number
  parts_completed: number
  material_used_sqft: number
  reusable_offset_sqft: number
  scrap_sqft: number
  fab_score: number
  cut_pieces: number
  stock_label: string | null
  cost_per_sqft: number | null
  pdf_url: string | null
  /**
   * Which cutting-engine surface recorded this cut:
   *  - `auto`   — pack-cli computed the layout (Auto-nest tab)
   *  - `manual` — operator authored the layout on the Free-roam canvas
   *
   * Defaulted to `auto` in the DB so rows pre-dating the migration
   * and any caller that hasn't been updated read as auto-nest.
   */
  source: "auto" | "manual"
  cut_date: string
  created_at: string
  updated_at: string
}

export interface RollReusableOffcutSummary {
  roll_id: string
  cut_count: number
  total_used_sqft: number
  total_reusable_sqft: number
  total_scrap_sqft: number
  last_cut_at: string | null
}

export type JobStatus = "draft" | "scheduled" | "in_progress" | "completed" | "cancelled"

export interface Job {
  id: string
  user_id: string
  /** Auto-assigned by the `jobs_assign_number` trigger (J-000001, …). */
  job_number: string
  name: string
  description: string | null
  /** Customer info lives inline on the job — no separate customers table. */
  customer_name: string | null
  customer_email: string | null
  customer_phone: string | null
  customer_po_number: string | null
  status: JobStatus
  due_date: string | null
  completed_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface JobPart {
  id: string
  user_id: string
  job_id: string
  material_type_id: string | null
  material_type: string | null
  /** Customer-supplied part number for this line item, not our internal roll barcode. */
  part_number: string | null
  description: string | null
  width: number
  length: number
  thickness: number | null
  quantity: number
  unit_price: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface JobWithParts extends Job {
  parts: JobPart[]
}

export type JobAssigneeRole = "lead" | "worker"

export interface JobAssignee {
  id: string
  user_id: string
  job_id: string
  name: string
  role: JobAssigneeRole
  notes: string | null
  created_at: string
  updated_at: string
}

export interface JobRollAllocation {
  id: string
  user_id: string
  job_id: string
  roll_id: string
  allocated_length: number
  notes: string | null
  created_at: string
  updated_at: string
}

/** Join shape used by the job detail page + PDF export. */
export interface JobRollAllocationWithRoll extends JobRollAllocation {
  roll: Pick<
    Roll,
    "id" | "part_number" | "material_type" | "width" | "length" | "remaining_length" | "location"
  > | null
}

export interface JobFullDetail extends JobWithParts {
  assignees: JobAssignee[]
  allocations: JobRollAllocationWithRoll[]
}

export interface CutHistoryWithProfile extends CutHistory {
  profiles: { full_name: string | null; roles: string[] | null } | null
}
