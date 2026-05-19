import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { nullableEqual } from "@/src/entities/shared/equality"
import { trimOptional, trimRequired } from "@/src/entities/shared/string-helpers"
import { Email } from "@/src/entities/value-objects/email"
import { ProfileId, SupplierId, TenantId } from "@/src/entities/value-objects/id"
import { Money, type MoneySnapshot } from "@/src/entities/value-objects/money"
import {
  PostalAddress,
  type PostalAddressSnapshot,
} from "@/src/entities/value-objects/postal-address"

// ─── Constants (mirror DB column lengths / checks) ─────────────────────────

const NAME_MAX = 200
const PHONE_MAX = 30
const WEBSITE_MAX = 500
const TAX_ID_MAX = 50
const PAYMENT_TERMS_MAX = 200
const RATING_MIN = 1
const RATING_MAX = 5
const TAX_RATE_MIN = 0
const TAX_RATE_MAX = 1

/** Mirrors the DB CHECK `website ~* '^https?://'`. */
const WEBSITE_PROTOCOL_REGEX = /^https?:\/\//

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateSupplierProps {
  id: SupplierId
  tenantId: TenantId
  name: string
  address?: PostalAddress | null
  email?: Email | null
  generalPhone?: string | null
  website?: string | null
  taxId?: string | null
  taxRate?: number | null
  taxExempt?: boolean
  paymentTerms?: string | null
  shippingCost?: Money | null
  rating?: number | null
  preferred?: boolean
  notes?: string | null
  createdBy?: ProfileId | null
}

export interface ReconstituteSupplierProps {
  id: SupplierId
  tenantId: TenantId
  name: string
  address: PostalAddress | null
  email: Email | null
  generalPhone: string | null
  website: string | null
  taxId: string | null
  taxRate: number | null
  taxExempt: boolean
  paymentTerms: string | null
  shippingCost: Money | null
  rating: number | null
  preferred: boolean
  isActive: boolean
  notes: string | null
  createdAt: Date
  createdBy: ProfileId | null
  updatedAt: Date
  updatedBy: ProfileId | null
  deletedAt: Date | null
}

/**
 * Bulk-edit payload for `Supplier.updateDetails`. Field-by-field mirror of
 * the editable fields. Activation state (`isActive`) and soft-delete are
 * NOT here — they have their own dedicated transitions.
 */
export interface SupplierUpdateProps {
  name: string
  address: PostalAddress | null
  email: Email | null
  generalPhone: string | null
  website: string | null
  taxId: string | null
  taxRate: number | null
  taxExempt: boolean
  paymentTerms: string | null
  shippingCost: Money | null
  rating: number | null
  preferred: boolean
  notes: string | null
}

export interface SupplierSnapshot {
  id: string
  tenantId: string
  name: string
  address: PostalAddressSnapshot | null
  email: string | null
  generalPhone: string | null
  website: string | null
  taxId: string | null
  taxRate: number | null
  taxExempt: boolean
  paymentTerms: string | null
  shippingCost: MoneySnapshot | null
  rating: number | null
  preferred: boolean
  isActive: boolean
  notes: string | null
  createdAt: string
  createdBy: string | null
  updatedAt: string
  updatedBy: string | null
  deletedAt: string | null
}

// ─── Entity ────────────────────────────────────────────────────────────────

/**
 * Tenant-scoped supplier directory. Address is an inline `PostalAddress`
 * value object (no separate addresses table — dropped 2026-05-12 for
 * snapshot semantics + blast-radius reasons). The supplier's address is
 * mutable on the entity ("where the supplier is today"); PO/invoice
 * addresses are snapshot at issue time.
 *
 * **`isActive` vs `deletedAt`** — distinct concepts:
 *   • `isActive = false` (deactivate) → "we no longer deal with this
 *     supplier, hide them in the picker" — user-facing "remove" action.
 *   • `deletedAt != null`  (softDelete) → admin-only purge; row stays for
 *     historical references but is treated as gone.
 *
 * The app's "Delete supplier" UI button wires to `deactivate()`, NOT to
 * `softDelete()`. Soft-delete is reserved for back-office cleanup.
 *
 * Lifecycle:
 *   create(props)         → new row; trims + validates each field
 *   reconstitute(props)   → DB rehydration, no validation
 *   updateDetails(...)    → aggregated bulk edit (props-object form)
 *   deactivate(...)       → user-facing "delete" — flips isActive to false
 *   reactivate(...)       → re-enables; throws if soft-deleted
 *   softDelete(...)       → admin-only terminal flag
 *
 * Source: suppliers table.
 */
export class Supplier {
  #id: SupplierId
  #tenantId: TenantId
  #name: string
  #address: PostalAddress | null
  #email: Email | null
  #generalPhone: string | null
  #website: string | null
  #taxId: string | null
  #taxRate: number | null
  #taxExempt: boolean
  #paymentTerms: string | null
  #shippingCost: Money | null
  #rating: number | null
  #preferred: boolean
  #isActive: boolean
  #notes: string | null
  #createdAt: Date
  #createdBy: ProfileId | null
  #updatedAt: Date
  #updatedBy: ProfileId | null
  #deletedAt: Date | null

  private constructor(props: ReconstituteSupplierProps) {
    this.#id = props.id
    this.#tenantId = props.tenantId
    this.#name = props.name
    this.#address = props.address
    this.#email = props.email
    this.#generalPhone = props.generalPhone
    this.#website = props.website
    this.#taxId = props.taxId
    this.#taxRate = props.taxRate
    this.#taxExempt = props.taxExempt
    this.#paymentTerms = props.paymentTerms
    this.#shippingCost = props.shippingCost
    this.#rating = props.rating
    this.#preferred = props.preferred
    this.#isActive = props.isActive
    this.#notes = props.notes
    this.#createdAt = props.createdAt
    this.#createdBy = props.createdBy
    this.#updatedAt = props.updatedAt
    this.#updatedBy = props.updatedBy
    this.#deletedAt = props.deletedAt
  }

  // ─── Factories ───────────────────────────────────────────────────────────

  static create(props: CreateSupplierProps, now: Date = new Date()): Supplier {
    const name = trimRequired(props.name, "name", NAME_MAX, "Supplier")
    const generalPhone = trimOptional(props.generalPhone, "generalPhone", PHONE_MAX, "Supplier")
    const website = Supplier.#normalizeWebsite(props.website)
    const taxId = trimOptional(props.taxId, "taxId", TAX_ID_MAX, "Supplier")
    const taxRate = Supplier.#normalizeTaxRate(props.taxRate)
    const paymentTerms = trimOptional(
      props.paymentTerms,
      "paymentTerms",
      PAYMENT_TERMS_MAX,
      "Supplier"
    )
    const shippingCost = Supplier.#normalizeShippingCost(props.shippingCost)
    const rating = Supplier.#normalizeRating(props.rating)
    const notes = trimOptional(props.notes, "notes", null, "Supplier")

    return new Supplier({
      id: props.id,
      tenantId: props.tenantId,
      name,
      address: props.address ?? null,
      email: props.email ?? null,
      generalPhone,
      website,
      taxId,
      taxRate,
      taxExempt: props.taxExempt ?? false,
      paymentTerms,
      shippingCost,
      rating,
      preferred: props.preferred ?? false,
      isActive: true,
      notes,
      createdAt: now,
      createdBy: props.createdBy ?? null,
      updatedAt: now,
      updatedBy: null,
      deletedAt: null,
    })
  }

  static reconstitute(props: ReconstituteSupplierProps): Supplier {
    return new Supplier(props)
  }

  static fromJSON(s: SupplierSnapshot): Supplier {
    return Supplier.reconstitute({
      id: SupplierId.fromPersistence(s.id),
      tenantId: TenantId.fromPersistence(s.tenantId),
      name: s.name,
      address: s.address ? PostalAddress.fromSnapshot(s.address) : null,
      email: s.email ? Email.fromPersistence(s.email) : null,
      generalPhone: s.generalPhone,
      website: s.website,
      taxId: s.taxId,
      taxRate: s.taxRate,
      taxExempt: s.taxExempt,
      paymentTerms: s.paymentTerms,
      shippingCost: s.shippingCost ? Money.fromSnapshot(s.shippingCost) : null,
      rating: s.rating,
      preferred: s.preferred,
      isActive: s.isActive,
      notes: s.notes,
      createdAt: new Date(s.createdAt),
      createdBy: s.createdBy ? ProfileId.fromPersistence(s.createdBy) : null,
      updatedAt: new Date(s.updatedAt),
      updatedBy: s.updatedBy ? ProfileId.fromPersistence(s.updatedBy) : null,
      deletedAt: s.deletedAt ? new Date(s.deletedAt) : null,
    })
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get id(): SupplierId {
    return this.#id
  }
  get tenantId(): TenantId {
    return this.#tenantId
  }
  get name(): string {
    return this.#name
  }
  get address(): PostalAddress | null {
    return this.#address
  }
  get email(): Email | null {
    return this.#email
  }
  get generalPhone(): string | null {
    return this.#generalPhone
  }
  get website(): string | null {
    return this.#website
  }
  get taxId(): string | null {
    return this.#taxId
  }
  get taxRate(): number | null {
    return this.#taxRate
  }
  get taxExempt(): boolean {
    return this.#taxExempt
  }
  get paymentTerms(): string | null {
    return this.#paymentTerms
  }
  get shippingCost(): Money | null {
    return this.#shippingCost
  }
  get rating(): number | null {
    return this.#rating
  }
  get preferred(): boolean {
    return this.#preferred
  }
  get isActive(): boolean {
    return this.#isActive
  }
  get notes(): string | null {
    return this.#notes
  }
  get createdAt(): Date {
    return this.#createdAt
  }
  get createdBy(): ProfileId | null {
    return this.#createdBy
  }
  get updatedAt(): Date {
    return this.#updatedAt
  }
  get updatedBy(): ProfileId | null {
    return this.#updatedBy
  }
  get deletedAt(): Date | null {
    return this.#deletedAt
  }

  // ─── State queries ───────────────────────────────────────────────────────

  get isDeleted(): boolean {
    return this.#deletedAt !== null
  }

  // ─── State transitions ───────────────────────────────────────────────────

  /**
   * Aggregated bulk edit. Form in the UI typically saves all editable
   * fields together; this matches that shape and produces one audit bump
   * per save. No-op if every field is unchanged.
   *
   * `isActive` and `deletedAt` are NOT touched here — they have their own
   * transitions (`deactivate`/`reactivate`/`softDelete`).
   */
  updateDetails(props: SupplierUpdateProps, updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("update details")

    const newName = trimRequired(props.name, "name", NAME_MAX, "Supplier")
    const newGeneralPhone = trimOptional(props.generalPhone, "generalPhone", PHONE_MAX, "Supplier")
    const newWebsite = Supplier.#normalizeWebsite(props.website)
    const newTaxId = trimOptional(props.taxId, "taxId", TAX_ID_MAX, "Supplier")
    const newTaxRate = Supplier.#normalizeTaxRate(props.taxRate)
    const newPaymentTerms = trimOptional(
      props.paymentTerms,
      "paymentTerms",
      PAYMENT_TERMS_MAX,
      "Supplier"
    )
    const newShippingCost = Supplier.#normalizeShippingCost(props.shippingCost)
    const newRating = Supplier.#normalizeRating(props.rating)
    const newNotes = trimOptional(props.notes, "notes", null, "Supplier")

    if (
      newName === this.#name &&
      nullableEqual(props.address, this.#address) &&
      nullableEqual(props.email, this.#email) &&
      newGeneralPhone === this.#generalPhone &&
      newWebsite === this.#website &&
      newTaxId === this.#taxId &&
      newTaxRate === this.#taxRate &&
      props.taxExempt === this.#taxExempt &&
      newPaymentTerms === this.#paymentTerms &&
      nullableEqual(newShippingCost, this.#shippingCost) &&
      newRating === this.#rating &&
      props.preferred === this.#preferred &&
      newNotes === this.#notes
    ) {
      return
    }

    this.#name = newName
    this.#address = props.address
    this.#email = props.email
    this.#generalPhone = newGeneralPhone
    this.#website = newWebsite
    this.#taxId = newTaxId
    this.#taxRate = newTaxRate
    this.#taxExempt = props.taxExempt
    this.#paymentTerms = newPaymentTerms
    this.#shippingCost = newShippingCost
    this.#rating = newRating
    this.#preferred = props.preferred
    this.#notes = newNotes
    this.#touchAudit(updatedBy, now)
  }

  /**
   * User-facing "remove" action. Flips `isActive` to `false` so the
   * supplier disappears from default pickers / lists, but the row stays
   * intact and existing FKs (rolls, material_suppliers, purchase orders)
   * keep working. Idempotent.
   */
  deactivate(updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("deactivate")
    if (!this.#isActive) return
    this.#isActive = false
    this.#touchAudit(updatedBy, now)
  }

  /**
   * Bring a deactivated supplier back. Idempotent; throws if soft-deleted.
   */
  reactivate(updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("reactivate")
    if (this.#isActive) return
    this.#isActive = true
    this.#touchAudit(updatedBy, now)
  }

  /**
   * Admin-only soft delete. Existing FKs keep their reference. Distinct
   * from `deactivate` — soft-delete is for back-office cleanup, not the
   * user-facing remove action. Idempotent.
   */
  softDelete(updatedBy: ProfileId, now: Date = new Date()): void {
    if (this.#deletedAt !== null) return
    this.#deletedAt = now
    this.#touchAudit(updatedBy, now)
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  static #normalizeTaxRate(value: number | null | undefined): number | null {
    if (value === null || value === undefined) return null
    if (!Number.isFinite(value)) {
      throw new InvalidEntityError("Supplier", "taxRate must be a finite number")
    }
    if (value < TAX_RATE_MIN || value > TAX_RATE_MAX) {
      throw new InvalidEntityError(
        "Supplier",
        `taxRate must be between ${TAX_RATE_MIN} and ${TAX_RATE_MAX}`
      )
    }
    return value
  }

  static #normalizeRating(value: number | null | undefined): number | null {
    if (value === null || value === undefined) return null
    if (!Number.isInteger(value)) {
      throw new InvalidEntityError("Supplier", "rating must be an integer")
    }
    if (value < RATING_MIN || value > RATING_MAX) {
      throw new InvalidEntityError(
        "Supplier",
        `rating must be between ${RATING_MIN} and ${RATING_MAX}`
      )
    }
    return value
  }

  static #normalizeShippingCost(value: Money | null | undefined): Money | null {
    if (value === null || value === undefined) return null
    if (value.cents < 0) {
      throw new InvalidEntityError("Supplier", "shippingCost must be >= 0")
    }
    return value
  }

  static #normalizeWebsite(value: string | null | undefined): string | null {
    const trimmed = trimOptional(value, "website", WEBSITE_MAX, "Supplier")
    if (trimmed === null) return null
    if (!WEBSITE_PROTOCOL_REGEX.test(trimmed)) {
      throw new InvalidEntityError("Supplier", "website must start with http:// or https://")
    }
    return trimmed
  }

  #touchAudit(updatedBy: ProfileId, now: Date): void {
    this.#updatedAt = now
    this.#updatedBy = updatedBy
  }

  #assertNotDeleted(operation: string): void {
    if (this.#deletedAt !== null) {
      throw new InvalidEntityError("Supplier", `cannot ${operation} on a deleted supplier`)
    }
  }

  // ─── Serialization ───────────────────────────────────────────────────────

  toJSON(): SupplierSnapshot {
    return {
      id: this.#id.value,
      tenantId: this.#tenantId.value,
      name: this.#name,
      address: this.#address?.toJSON() ?? null,
      email: this.#email?.value ?? null,
      generalPhone: this.#generalPhone,
      website: this.#website,
      taxId: this.#taxId,
      taxRate: this.#taxRate,
      taxExempt: this.#taxExempt,
      paymentTerms: this.#paymentTerms,
      shippingCost: this.#shippingCost?.toJSON() ?? null,
      rating: this.#rating,
      preferred: this.#preferred,
      isActive: this.#isActive,
      notes: this.#notes,
      createdAt: this.#createdAt.toISOString(),
      createdBy: this.#createdBy?.value ?? null,
      updatedAt: this.#updatedAt.toISOString(),
      updatedBy: this.#updatedBy?.value ?? null,
      deletedAt: this.#deletedAt?.toISOString() ?? null,
    }
  }
}
