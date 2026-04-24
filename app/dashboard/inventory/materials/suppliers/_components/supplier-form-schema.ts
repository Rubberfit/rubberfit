import * as z from "zod"

export const supplierSchema = z.object({
  name: z.string().min(1, "Supplier name is required").max(100),
  contact_person: z.string().max(100).optional(),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  phone: z.string().max(20).optional(),
  address: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(50).optional(),
  zip_code: z.string().max(20).optional(),
  country: z.string().max(100).optional(),
  website: z.string().url("Invalid URL").optional().or(z.literal("")),
  tax_id: z.string().max(50).optional(),
  payment_terms: z.string().max(100).optional(),
  rating: z.number().min(1).max(5).optional(),
  preferred: z.boolean(),
  active: z.boolean(),
  notes: z.string().optional(),
  // Tax and shipping configuration
  tax_rate: z.number().min(0).max(1).optional(),
  tax_exempt: z.boolean(),
  default_shipping_cost: z.number().min(0).optional(),
  shipping_calculation_type: z.enum(["flat", "weight", "percentage", "custom"]).optional(),
})

export type SupplierFormData = z.infer<typeof supplierSchema>

export const DEFAULT_FORM_VALUES: SupplierFormData = {
  name: "",
  contact_person: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  zip_code: "",
  country: "USA",
  website: "",
  tax_id: "",
  payment_terms: "Net 30",
  rating: undefined,
  preferred: false,
  active: true,
  notes: "",
  tax_rate: 0.08,
  tax_exempt: false,
  default_shipping_cost: 50,
  shipping_calculation_type: "flat" as const,
}

export function supplierToFormData(supplier: {
  name: string
  contact_person?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  zip_code?: string | null
  country?: string | null
  website?: string | null
  tax_id?: string | null
  payment_terms?: string | null
  rating?: number | null
  preferred: boolean
  active: boolean
  notes?: string | null
  tax_rate?: number | null
  tax_exempt?: boolean | null
  default_shipping_cost?: number | null
  shipping_calculation_type?: string | null
}): SupplierFormData {
  return {
    name: supplier.name,
    contact_person: supplier.contact_person || "",
    email: supplier.email || "",
    phone: supplier.phone || "",
    address: supplier.address || "",
    city: supplier.city || "",
    state: supplier.state || "",
    zip_code: supplier.zip_code || "",
    country: supplier.country || "USA",
    website: supplier.website || "",
    tax_id: supplier.tax_id || "",
    payment_terms: supplier.payment_terms || "Net 30",
    rating: supplier.rating || undefined,
    preferred: supplier.preferred,
    active: supplier.active,
    notes: supplier.notes || "",
    tax_rate: supplier.tax_rate ?? 0.08,
    tax_exempt: supplier.tax_exempt ?? false,
    default_shipping_cost: supplier.default_shipping_cost ?? 50,
    shipping_calculation_type:
      (supplier.shipping_calculation_type as SupplierFormData["shipping_calculation_type"]) ||
      "flat",
  }
}

// eslint-disable-next-line complexity
export function buildSupplierPayload(data: SupplierFormData, isUpdate: boolean) {
  // Helper: for updates, use null to clear a field in the database.
  // For inserts, use undefined so the field is omitted and gets the DB default.
  const emptyValue = isUpdate ? null : undefined

  return {
    name: data.name.trim(),
    contact_person: data.contact_person?.trim() || emptyValue,
    email: data.email?.trim() || emptyValue,
    phone: data.phone?.trim() || emptyValue,
    address: data.address?.trim() || emptyValue,
    city: data.city?.trim() || emptyValue,
    state: data.state?.trim() || emptyValue,
    zip_code: data.zip_code?.trim() || emptyValue,
    country: data.country?.trim() || emptyValue,
    website: data.website?.trim() || emptyValue,
    tax_id: data.tax_id?.trim() || emptyValue,
    payment_terms: data.payment_terms?.trim() || emptyValue,
    rating: data.rating ?? emptyValue,
    preferred: data.preferred,
    active: data.active,
    notes: data.notes?.trim() || emptyValue,
    tax_rate: data.tax_rate ?? 0.08,
    tax_exempt: data.tax_exempt ?? false,
    default_shipping_cost: data.default_shipping_cost ?? 50,
    shipping_calculation_type: data.shipping_calculation_type || "flat",
  }
}
