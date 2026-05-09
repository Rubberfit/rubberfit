import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import {
  trimOptional,
  trimRequired,
} from "@/src/entities/shared/string-helpers"
import { AddressId, ProfileId, TenantId } from "@/src/entities/value-objects/id"

// ─── Constants (mirror DB column lengths) ──────────────────────────────────

const ADDRESS_LINE_MAX = 200
const CITY_MAX = 100
const STATE_MAX = 100
const POSTAL_CODE_MAX = 20
const COUNTRY_MAX = 100
const DEFAULT_COUNTRY = "United States"

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateAddressProps {
  id: AddressId
  tenantId: TenantId
  addressLine1: string
  city: string
  state: string
  postalCode: string
  addressLine2?: string | null
  country?: string // defaults to "United States"
  createdBy?: ProfileId | null
}

export interface ReconstituteAddressProps {
  id: AddressId
  tenantId: TenantId
  addressLine1: string
  addressLine2: string | null
  city: string
  state: string
  postalCode: string
  country: string
  createdAt: Date
  createdBy: ProfileId | null
  updatedAt: Date
  updatedBy: ProfileId | null
  deletedAt: Date | null
}

export interface AddressSnapshot {
  id: string
  tenantId: string
  addressLine1: string
  addressLine2: string | null
  city: string
  state: string
  postalCode: string
  country: string
  createdAt: string
  createdBy: string | null
  updatedAt: string
  updatedBy: string | null
  deletedAt: string | null
}

// ─── Entity ────────────────────────────────────────────────────────────────

/**
 * Postal address, tenant-scoped. Modeled as an entity (not a VO) because
 * the schema gives it its own id, audit columns, and soft-delete —
 * suppliers, purchase orders, and (later) job billing references this
 * row by FK rather than embedding the fields.
 *
 * The fields themselves are bare strings — Country / PostalCode / Phone
 * are not VOs (see the design discussion in feature/DDD-implementation
 * Round 3). Length validation lives inline; format validation is a UI
 * concern.
 *
 * Lifecycle:
 *   create(props)        → new row; trims + length-validates each field
 *   reconstitute(props)  → DB rehydration, no validation
 *   updateDetails(...)   → aggregated whole-address edit ("Edit Address" form save)
 *   softDelete(...)      → terminal; existing FKs may keep referencing it
 *
 * Source: addresses table.
 */
export class Address {
  #id: AddressId
  #tenantId: TenantId
  #addressLine1: string
  #addressLine2: string | null
  #city: string
  #state: string
  #postalCode: string
  #country: string
  #createdAt: Date
  #createdBy: ProfileId | null
  #updatedAt: Date
  #updatedBy: ProfileId | null
  #deletedAt: Date | null

  private constructor(props: ReconstituteAddressProps) {
    this.#id = props.id
    this.#tenantId = props.tenantId
    this.#addressLine1 = props.addressLine1
    this.#addressLine2 = props.addressLine2
    this.#city = props.city
    this.#state = props.state
    this.#postalCode = props.postalCode
    this.#country = props.country
    this.#createdAt = props.createdAt
    this.#createdBy = props.createdBy
    this.#updatedAt = props.updatedAt
    this.#updatedBy = props.updatedBy
    this.#deletedAt = props.deletedAt
  }

  // ─── Factories ───────────────────────────────────────────────────────────

  static create(props: CreateAddressProps, now: Date = new Date()): Address {
    const line1 = trimRequired(props.addressLine1, "addressLine1", ADDRESS_LINE_MAX, "Address")
    const line2 = trimOptional(props.addressLine2, "addressLine2", ADDRESS_LINE_MAX, "Address")
    const city = trimRequired(props.city, "city", CITY_MAX, "Address")
    const state = trimRequired(props.state, "state", STATE_MAX, "Address")
    const postalCode = trimRequired(props.postalCode, "postalCode", POSTAL_CODE_MAX, "Address")
    const country = trimRequired(
      props.country ?? DEFAULT_COUNTRY,
      "country",
      COUNTRY_MAX,
      "Address",
    )

    return new Address({
      id: props.id,
      tenantId: props.tenantId,
      addressLine1: line1,
      addressLine2: line2,
      city,
      state,
      postalCode,
      country,
      createdAt: now,
      createdBy: props.createdBy ?? null,
      updatedAt: now,
      updatedBy: null,
      deletedAt: null,
    })
  }

  static reconstitute(props: ReconstituteAddressProps): Address {
    return new Address(props)
  }

  static fromJSON(s: AddressSnapshot): Address {
    return Address.reconstitute({
      id: AddressId.fromPersistence(s.id),
      tenantId: TenantId.fromPersistence(s.tenantId),
      addressLine1: s.addressLine1,
      addressLine2: s.addressLine2,
      city: s.city,
      state: s.state,
      postalCode: s.postalCode,
      country: s.country,
      createdAt: new Date(s.createdAt),
      createdBy: s.createdBy ? ProfileId.fromPersistence(s.createdBy) : null,
      updatedAt: new Date(s.updatedAt),
      updatedBy: s.updatedBy ? ProfileId.fromPersistence(s.updatedBy) : null,
      deletedAt: s.deletedAt ? new Date(s.deletedAt) : null,
    })
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get id(): AddressId { return this.#id }
  get tenantId(): TenantId { return this.#tenantId }
  get addressLine1(): string { return this.#addressLine1 }
  get addressLine2(): string | null { return this.#addressLine2 }
  get city(): string { return this.#city }
  get state(): string { return this.#state }
  get postalCode(): string { return this.#postalCode }
  get country(): string { return this.#country }
  get createdAt(): Date { return this.#createdAt }
  get createdBy(): ProfileId | null { return this.#createdBy }
  get updatedAt(): Date { return this.#updatedAt }
  get updatedBy(): ProfileId | null { return this.#updatedBy }
  get deletedAt(): Date | null { return this.#deletedAt }

  // ─── State queries ───────────────────────────────────────────────────────

  get isDeleted(): boolean {
    return this.#deletedAt !== null
  }

  // ─── State transitions ───────────────────────────────────────────────────

  /**
   * Aggregated whole-address edit. Address forms in the UI typically save
   * all fields together — folding them into one method matches the form
   * shape and gives one audit bump per save. No-op if every field is
   * unchanged.
   */
  updateDetails(
    addressLine1: string,
    addressLine2: string | null,
    city: string,
    state: string,
    postalCode: string,
    country: string,
    updatedBy: ProfileId,
    now: Date = new Date(),
  ): void {
    this.#assertNotDeleted("update details")
    const newLine1 = trimRequired(addressLine1, "addressLine1", ADDRESS_LINE_MAX, "Address")
    const newLine2 = trimOptional(addressLine2, "addressLine2", ADDRESS_LINE_MAX, "Address")
    const newCity = trimRequired(city, "city", CITY_MAX, "Address")
    const newState = trimRequired(state, "state", STATE_MAX, "Address")
    const newPostal = trimRequired(postalCode, "postalCode", POSTAL_CODE_MAX, "Address")
    const newCountry = trimRequired(country, "country", COUNTRY_MAX, "Address")

    if (
      newLine1 === this.#addressLine1 &&
      newLine2 === this.#addressLine2 &&
      newCity === this.#city &&
      newState === this.#state &&
      newPostal === this.#postalCode &&
      newCountry === this.#country
    ) {
      return
    }

    this.#addressLine1 = newLine1
    this.#addressLine2 = newLine2
    this.#city = newCity
    this.#state = newState
    this.#postalCode = newPostal
    this.#country = newCountry
    this.#touchAudit(updatedBy, now)
  }

  /**
   * Soft-delete. Existing FKs (suppliers.address_id, etc.) keep their
   * reference — the row stays in the table for historical reads.
   * Idempotent.
   */
  softDelete(updatedBy: ProfileId, now: Date = new Date()): void {
    if (this.#deletedAt !== null) return
    this.#deletedAt = now
    this.#touchAudit(updatedBy, now)
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  #touchAudit(updatedBy: ProfileId, now: Date): void {
    this.#updatedAt = now
    this.#updatedBy = updatedBy
  }

  #assertNotDeleted(operation: string): void {
    if (this.#deletedAt !== null) {
      throw new InvalidEntityError(
        "Address",
        `cannot ${operation} on a deleted address`,
      )
    }
  }

  // ─── Serialization ───────────────────────────────────────────────────────

  toJSON(): AddressSnapshot {
    return {
      id: this.#id.value,
      tenantId: this.#tenantId.value,
      addressLine1: this.#addressLine1,
      addressLine2: this.#addressLine2,
      city: this.#city,
      state: this.#state,
      postalCode: this.#postalCode,
      country: this.#country,
      createdAt: this.#createdAt.toISOString(),
      createdBy: this.#createdBy?.value ?? null,
      updatedAt: this.#updatedAt.toISOString(),
      updatedBy: this.#updatedBy?.value ?? null,
      deletedAt: this.#deletedAt?.toISOString() ?? null,
    }
  }
}

