import { Supplier } from "@/src/entities/supplier"
import { Email } from "@/src/entities/value-objects/email"
import { ProfileId, SupplierId, TenantId } from "@/src/entities/value-objects/id"
import { Currency } from "@/src/entities/value-objects/currency"
import { Money } from "@/src/entities/value-objects/money"
import { PostalAddress } from "@/src/entities/value-objects/postal-address"

/**
 * Persistence shape for the `suppliers` table. Defined locally rather
 * than imported from `@/src/infrastructure/models/supabase` because that
 * file's `Supplier` type is the pre-redesign legacy row (snake_case
 * `user_id`, flat address columns, `default_shipping_cost`). The schema
 * actually shipped in `20260421000002_schema_inventory.sql` uses
 * `tenant_id`, inline address columns (no shared addresses table —
 * dropped 2026-05-12), `general_phone`, `shipping_cost_cents`, plus
 * full audit columns. This local type is the source of truth for
 * mapper code; regenerated Supabase types will replace it later.
 */
export interface SupplierRow {
  id: string
  tenant_id: string
  name: string
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string | null
  email: string | null
  general_phone: string | null
  website: string | null
  tax_id: string | null
  tax_rate: number | null
  tax_exempt: boolean
  payment_terms: string | null
  shipping_cost_cents: number | null
  rating: number | null
  preferred: boolean
  active: boolean
  notes: string | null
  created_at: string
  created_by: string | null
  updated_at: string
  updated_by: string | null
  deleted_at: string | null
}

export interface SupplierInsertRow {
  id: string
  tenant_id: string
  name: string
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string | null
  email: string | null
  general_phone: string | null
  website: string | null
  tax_id: string | null
  tax_rate: number | null
  tax_exempt: boolean
  payment_terms: string | null
  shipping_cost_cents: number | null
  rating: number | null
  preferred: boolean
  active: boolean
  notes: string | null
  created_by: string | null
}

export type SupplierUpdateRow = Partial<
  Pick<
    SupplierRow,
    | "name"
    | "address_line1"
    | "address_line2"
    | "city"
    | "state"
    | "postal_code"
    | "country"
    | "email"
    | "general_phone"
    | "website"
    | "tax_id"
    | "tax_rate"
    | "tax_exempt"
    | "payment_terms"
    | "shipping_cost_cents"
    | "rating"
    | "preferred"
    | "active"
    | "notes"
    | "updated_at"
    | "updated_by"
    | "deleted_at"
  >
>

/**
 * Suppliers table stores only cents (`shipping_cost_cents`) without a
 * currency code — the redesigned schema assumes tenant-level currency.
 * Until a per-tenant currency column lands, default to USD on read.
 * The supplier entity carries the Money VO; downstream code may swap
 * the currency through `updateDetails` once tenants opt in to non-USD.
 */
const DEFAULT_CURRENCY = Currency.fromPersistence("USD")

interface SupplierAddressColumns {
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string | null
}

function addressToSupplierColumns(supplier: Supplier): SupplierAddressColumns {
  const a = supplier.address
  return {
    address_line1: a?.line1 ?? null,
    address_line2: a?.line2 ?? null,
    city: a?.city ?? null,
    state: a?.state ?? null,
    postal_code: a?.postalCode ?? null,
    country: a?.country ?? null,
  }
}

export function rowToSupplier(row: SupplierRow): Supplier {
  return Supplier.reconstitute({
    id: SupplierId.fromPersistence(row.id),
    tenantId: TenantId.fromPersistence(row.tenant_id),
    name: row.name,
    address: PostalAddress.fromRow({
      line1: row.address_line1,
      line2: row.address_line2,
      city: row.city,
      state: row.state,
      postal_code: row.postal_code,
      country: row.country,
    }),
    email: row.email ? Email.fromPersistence(row.email) : null,
    generalPhone: row.general_phone,
    website: row.website,
    taxId: row.tax_id,
    taxRate: row.tax_rate,
    taxExempt: row.tax_exempt,
    paymentTerms: row.payment_terms,
    shippingCost:
      row.shipping_cost_cents !== null
        ? Money.fromCents(row.shipping_cost_cents, DEFAULT_CURRENCY)
        : null,
    rating: row.rating,
    preferred: row.preferred,
    isActive: row.active,
    notes: row.notes,
    createdAt: new Date(row.created_at),
    createdBy: row.created_by ? ProfileId.fromPersistence(row.created_by) : null,
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by ? ProfileId.fromPersistence(row.updated_by) : null,
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
  })
}

export function supplierToInsertRow(supplier: Supplier): SupplierInsertRow {
  return {
    id: supplier.id.value,
    tenant_id: supplier.tenantId.value,
    name: supplier.name,
    ...addressToSupplierColumns(supplier),
    email: supplier.email?.value ?? null,
    general_phone: supplier.generalPhone,
    website: supplier.website,
    tax_id: supplier.taxId,
    tax_rate: supplier.taxRate,
    tax_exempt: supplier.taxExempt,
    payment_terms: supplier.paymentTerms,
    shipping_cost_cents: supplier.shippingCost?.cents ?? null,
    rating: supplier.rating,
    preferred: supplier.preferred,
    active: supplier.isActive,
    notes: supplier.notes,
    created_by: supplier.createdBy?.value ?? null,
  }
}

export function supplierToUpdateRow(supplier: Supplier): SupplierUpdateRow {
  return {
    name: supplier.name,
    ...addressToSupplierColumns(supplier),
    email: supplier.email?.value ?? null,
    general_phone: supplier.generalPhone,
    website: supplier.website,
    tax_id: supplier.taxId,
    tax_rate: supplier.taxRate,
    tax_exempt: supplier.taxExempt,
    payment_terms: supplier.paymentTerms,
    shipping_cost_cents: supplier.shippingCost?.cents ?? null,
    rating: supplier.rating,
    preferred: supplier.preferred,
    active: supplier.isActive,
    notes: supplier.notes,
    updated_at: supplier.updatedAt.toISOString(),
    updated_by: supplier.updatedBy?.value ?? null,
    deleted_at: supplier.deletedAt?.toISOString() ?? null,
  }
}
