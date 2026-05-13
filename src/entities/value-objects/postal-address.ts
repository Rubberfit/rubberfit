import { trimOptional, trimRequired } from "@/src/entities/shared/string-helpers"

// ─── Constants (mirror DB column lengths) ──────────────────────────────────

const ADDRESS_LINE_MAX = 200
const CITY_MAX = 100
const STATE_MAX = 100
const POSTAL_CODE_MAX = 20
const COUNTRY_MAX = 100
const DEFAULT_COUNTRY = "United States"

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface CreatePostalAddressProps {
  line1: string
  line2?: string | null
  city: string
  state: string
  postalCode: string
  country?: string // defaults to "United States"
}

export interface PostalAddressSnapshot {
  line1: string
  line2: string | null
  city: string
  state: string
  postalCode: string
  country: string
}

/**
 * Row shape for the inline address columns shared across owning tables
 * (suppliers, purchase_orders shipping/billing, invoices billing).
 * Mappers use this to round-trip between the entity's `PostalAddress`
 * VO and DB columns named with a per-usage prefix (e.g.
 * `address_line1` on suppliers, `shipping_line1` / `billing_line1` on
 * purchase_orders).
 */
export interface PostalAddressRow {
  line1: string | null
  line2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string | null
}

// ─── Value object ──────────────────────────────────────────────────────────

/**
 * Postal address as a value object. Replaces the prior `Address` entity
 * + tenant-scoped `addresses` table (dropped on 2026-05-12 after a
 * security/snapshot review):
 *
 *   • Snapshot-by-value at issue time. A historical PO row continues
 *     to show the address it was sent to, even if the supplier later
 *     corrects their own mailing address.
 *   • No flat-dump path. The fields live on the owning record and
 *     inherit that record's RLS, instead of pooling into a tenant-wide
 *     `addresses` table any tenant member could SELECT.
 *
 * The fields themselves are bare strings — Country / PostalCode / Phone
 * are not VOs (decided during the original schema redesign). Length
 * validation lives here; format validation is a UI concern.
 *
 * Equality is structural over the six fields. Two PostalAddress
 * instances are equal iff every trimmed field matches exactly.
 */
export class PostalAddress {
  public readonly line1: string
  public readonly line2: string | null
  public readonly city: string
  public readonly state: string
  public readonly postalCode: string
  public readonly country: string

  private constructor(props: {
    line1: string
    line2: string | null
    city: string
    state: string
    postalCode: string
    country: string
  }) {
    this.line1 = props.line1
    this.line2 = props.line2
    this.city = props.city
    this.state = props.state
    this.postalCode = props.postalCode
    this.country = props.country
  }

  // ─── Factories ───────────────────────────────────────────────────────────

  static create(props: CreatePostalAddressProps): PostalAddress {
    const line1 = trimRequired(props.line1, "line1", ADDRESS_LINE_MAX, "PostalAddress")
    const line2 = trimOptional(props.line2, "line2", ADDRESS_LINE_MAX, "PostalAddress")
    const city = trimRequired(props.city, "city", CITY_MAX, "PostalAddress")
    const state = trimRequired(props.state, "state", STATE_MAX, "PostalAddress")
    const postalCode = trimRequired(
      props.postalCode,
      "postalCode",
      POSTAL_CODE_MAX,
      "PostalAddress"
    )
    const country = trimRequired(
      props.country ?? DEFAULT_COUNTRY,
      "country",
      COUNTRY_MAX,
      "PostalAddress"
    )
    return new PostalAddress({ line1, line2, city, state, postalCode, country })
  }

  /**
   * Trusted-source factory: rehydrate from a DB row (mapper layer).
   * No validation — bad data on disk surfaces as downstream errors,
   * not silent coercion here.
   */
  static fromPersistence(row: PostalAddressSnapshot): PostalAddress {
    return new PostalAddress({
      line1: row.line1,
      line2: row.line2,
      city: row.city,
      state: row.state,
      postalCode: row.postalCode,
      country: row.country,
    })
  }

  static fromSnapshot(snapshot: PostalAddressSnapshot): PostalAddress {
    return PostalAddress.fromPersistence(snapshot)
  }

  /**
   * Builds a `PostalAddress` from a flat-column row segment (mapper
   * helper). Returns `null` if `line1` is missing — the convention used
   * by every owning mapper to signal "no address on this record."
   */
  static fromRow(row: PostalAddressRow): PostalAddress | null {
    if (!row.line1) return null
    return new PostalAddress({
      line1: row.line1,
      line2: row.line2,
      city: row.city ?? "",
      state: row.state ?? "",
      postalCode: row.postal_code ?? "",
      country: row.country ?? DEFAULT_COUNTRY,
    })
  }

  // ─── Equality + serialization ────────────────────────────────────────────

  equals(other: PostalAddress | null | undefined): boolean {
    if (!other) return false
    return (
      this.line1 === other.line1 &&
      this.line2 === other.line2 &&
      this.city === other.city &&
      this.state === other.state &&
      this.postalCode === other.postalCode &&
      this.country === other.country
    )
  }

  toJSON(): PostalAddressSnapshot {
    return {
      line1: this.line1,
      line2: this.line2,
      city: this.city,
      state: this.state,
      postalCode: this.postalCode,
      country: this.country,
    }
  }

  /**
   * Flat-column projection for mappers. Mirrors `PostalAddressRow` —
   * use with `Object.assign(insertRow, address.toRow())` then prefix
   * the column names as the owning table requires.
   */
  toRow(): PostalAddressRow {
    return {
      line1: this.line1,
      line2: this.line2,
      city: this.city,
      state: this.state,
      postal_code: this.postalCode,
      country: this.country,
    }
  }
}
