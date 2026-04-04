import { createBrowserClient } from "@supabase/ssr";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
// Database Types
export interface MaterialType {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  default_cost?: number;
  min_stock_alert?: number;
  created_at: string;
  updated_at: string;
}

export interface Roll {
  id: string;
  user_id: string;
  material_type_id?: string;
  material_type: string;
  width: number;
  length: number;
  thickness: number;
  color?: string;
  location?: string;
  date_received?: string;
  supplier?: string;
  cost_per_sqft?: number;
  remaining_length: number;
  status: "active" | "depleted" | "reserved";
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Cut {
  id: string;
  user_id: string;
  roll_id?: string;
  cut_width: number;
  cut_length: number;
  quantity: number;
  waste_sqft?: number;
  waste_percentage?: number;
  total_sqft_used?: number;
  job_reference?: string;
  cut_by?: string;
  notes?: string;
  created_at: string;
}

// Phase 2 Types - Supplier Management
export interface Supplier {
  id: string;
  user_id: string;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  country?: string;
  website?: string;
  tax_id?: string;
  payment_terms?: string;
  rating?: number;
  preferred: boolean;
  active: boolean;
  notes?: string;
  tax_rate?: number;
  tax_exempt?: boolean;
  default_shipping_cost?: number;
  shipping_calculation_type?: "flat" | "weight" | "percentage" | "custom";
  created_at: string;
  updated_at: string;
}

export interface MaterialSupplier {
  id: string;
  user_id: string;
  material_type_id: string;
  supplier_id: string;
  supplier_material_code?: string;
  cost_per_sqft: number;
  minimum_order_sqft?: number;
  lead_time_days?: number;
  preferred_supplier: boolean;
  active: boolean;
  notes?: string;
  effective_date: string;
  expiration_date?: string;
  created_at: string;
  updated_at: string;
}

export interface PriceHistory {
  id: string;
  user_id: string;
  material_supplier_id: string;
  old_cost_per_sqft?: number;
  new_cost_per_sqft: number;
  price_change_percentage?: number;
  change_reason?: string;
  effective_date: string;
  changed_by?: string;
  notes?: string;
  created_at: string;
}

// Phase 2 Types - Auto-Reorder System
export interface ReorderRule {
  id: string;
  user_id: string;
  material_type_id: string;
  supplier_id?: string;
  reorder_point: number;
  reorder_quantity: number;
  max_stock_level?: number;
  lead_time_days: number;
  safety_stock_days: number;
  auto_reorder: boolean;
  active: boolean;
  notes?: string;
  last_triggered_at?: string;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrder {
  id: string;
  user_id: string;
  po_number: string;
  supplier_id: string;
  status: "draft" | "pending" | "approved" | "ordered" | "received" | "cancelled";
  order_date?: string;
  requested_delivery_date?: string;
  actual_delivery_date?: string;
  subtotal: number;
  tax_amount: number;
  shipping_cost: number;
  total_amount: number;
  payment_terms?: string;
  shipping_address?: string;
  billing_address?: string;
  notes?: string;
  created_by?: string;
  approved_by?: string;
  approved_at?: string;
  auto_generated: boolean;
  reorder_rule_id?: string;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderItem {
  id: string;
  user_id: string;
  purchase_order_id: string;
  material_type_id: string;
  line_number: number;
  description: string;
  width?: number;
  length?: number;
  thickness?: number;
  color?: string;
  quantity_sqft: number;
  unit_cost: number;
  line_total: number;
  quantity_received: number;
  received_date?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// Phase 2 Types - Notification System
export interface NotificationPreferences {
  id: string;
  user_id: string;
  user_identifier: string;
  email?: string;
  phone?: string;
  sms_enabled: boolean;
  email_enabled: boolean;
  low_stock_enabled: boolean;
  low_stock_threshold_override?: number;
  reorder_triggered_enabled: boolean;
  po_created_enabled: boolean;
  po_approved_enabled: boolean;
  delivery_expected_enabled: boolean;
  delivery_overdue_enabled: boolean;
  delivery_received_enabled: boolean;
  price_change_enabled: boolean;
  price_change_threshold: number;
  system_maintenance_enabled: boolean;
  critical_alerts_enabled: boolean;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  timezone: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotificationQueue {
  id: string;
  user_id: string;
  user_identifier: string;
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
    | "critical_alert";
  title: string;
  message: string;
  send_email: boolean;
  send_sms: boolean;
  priority: "low" | "normal" | "high" | "critical";
  scheduled_for: string;
  status: "pending" | "processing" | "sent" | "failed" | "cancelled";
  email_sent_at?: string;
  email_delivered_at?: string;
  email_failed_at?: string;
  email_error_message?: string;
  sms_sent_at?: string;
  sms_delivered_at?: string;
  sms_failed_at?: string;
  sms_error_message?: string;
  retry_count: number;
  max_retries: number;
  next_retry_at?: string;
  context_data?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// Extended types for joins and computed fields
export interface MaterialSupplierWithDetails extends MaterialSupplier {
  material_type?: MaterialType;
  supplier?: Supplier;
}

export interface PurchaseOrderWithDetails extends PurchaseOrder {
  supplier?: Supplier;
  items?: PurchaseOrderItem[];
  items_count?: number;
}

export interface PurchaseOrderItemWithDetails extends PurchaseOrderItem {
  material_type?: MaterialType;
  purchase_order?: PurchaseOrder;
}

export interface ReorderRuleWithDetails extends ReorderRule {
  material_type?: MaterialType;
  supplier?: Supplier;
  current_stock?: number;
  stock_status?: "ok" | "low" | "critical";
}

// Utility types for forms and API calls
export type CreateSupplier = Omit<Supplier, "id" | "user_id" | "created_at" | "updated_at">;
export type UpdateSupplier = Partial<CreateSupplier>;

export type CreateMaterialSupplier = Omit<MaterialSupplier, "id" | "user_id" | "created_at" | "updated_at">;
export type UpdateMaterialSupplier = Partial<CreateMaterialSupplier>;

export type CreateReorderRule = Omit<ReorderRule, "id" | "user_id" | "created_at" | "updated_at" | "last_triggered_at">;
export type UpdateReorderRule = Partial<CreateReorderRule & { last_triggered_at?: string }>;

export type CreatePurchaseOrder = Omit<
  PurchaseOrder,
  "id" | "user_id" | "created_at" | "updated_at" | "po_number" | "approved_at"
>;
export type UpdatePurchaseOrder = Partial<CreatePurchaseOrder>;

export type CreatePurchaseOrderItem = Omit<
  PurchaseOrderItem,
  "id" | "user_id" | "created_at" | "updated_at" | "line_number" | "line_total" | "quantity_received"
>;
export type UpdatePurchaseOrderItem = Partial<CreatePurchaseOrderItem>;

export type CreateNotificationPreferences = Omit<
  NotificationPreferences,
  "id" | "user_id" | "created_at" | "updated_at"
>;
export type UpdateNotificationPreferences = Partial<CreateNotificationPreferences>;

export type CreateNotificationQueue = Omit<
  NotificationQueue,
  "id" | "user_id" | "created_at" | "updated_at" | "retry_count" | "next_retry_at"
>;
export type UpdateNotificationQueue = Partial<CreateNotificationQueue>;
