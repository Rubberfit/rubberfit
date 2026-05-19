import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { Currency } from "@/src/entities/value-objects/currency"
import { ProfileId, TenantId } from "@/src/entities/value-objects/id"

// ─── Type unions ───────────────────────────────────────────────────────────

/**
 * Unit system for display + input. Storage is always metric (mm / sqm /
 * cents) regardless; the app converts at the UI edge based on this setting.
 *
 * Mirrors the DB CHECK on tenant_settings.unit_system.
 */
export type UnitSystem = "metric" | "imperial"

export const UNIT_SYSTEMS = ["metric", "imperial"] as const satisfies readonly UnitSystem[]

// ─── JSONB shapes ──────────────────────────────────────────────────────────

/**
 * Tenant-wide inventory configuration. Stored as `jsonb` in the DB so the
 * shape can evolve without migrations. Unknown/future fields round-trip
 * through the entity untouched (DB → snapshot → DB).
 *
 * All fields are optional — a fresh tenant has `{}` and reads default to
 * the codebase fallbacks (constants in src/config or use-case layer).
 */
export interface InventorySettings {
  /** Auto-fire low-stock notifications when a material's available roll length drops below this many millimeters. */
  defaultLowStockThresholdMm?: number
  /** Master switch for the automated reorder PO generation flow. */
  autoReorderEnabled?: boolean
  /** Default lead time (days) used when a supplier-specific lead time isn't set. */
  defaultLeadTimeDays?: number
}

// ─── Constants ─────────────────────────────────────────────────────────────

const DATE_FORMAT_MAX_LENGTH = 20
const TIMEZONE_MAX_LENGTH = 50

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateTenantSettingsProps {
  tenantId: TenantId
  defaultCurrency?: Currency // default USD
  unitSystem?: UnitSystem // default metric
  dateFormat?: string // default "MM/DD/YYYY"
  timezone?: string // default "America/New_York"
  inventorySettings?: InventorySettings // default {}
}

export interface ReconstituteTenantSettingsProps {
  tenantId: TenantId
  defaultCurrency: Currency
  unitSystem: UnitSystem
  dateFormat: string
  timezone: string
  inventorySettings: InventorySettings
  createdAt: Date
  updatedAt: Date
  updatedBy: ProfileId | null
}

export interface TenantSettingsSnapshot {
  tenantId: string
  defaultCurrency: string
  unitSystem: UnitSystem
  dateFormat: string
  timezone: string
  inventorySettings: InventorySettings
  createdAt: string
  updatedAt: string
  updatedBy: string | null
}

// ─── Entity ────────────────────────────────────────────────────────────────

/**
 * Tenant-wide preferences. Shared-PK 1:1 companion to Tenant — `tenantId`
 * is both the entity identity AND the parent FK. Always exactly one row
 * per tenant; `ON DELETE CASCADE` removes it when the tenant is deleted.
 *
 * Aggregate boundary: separate from Tenant. The use case that creates a
 * tenant also creates this companion (no DB trigger does it for us).
 *
 * No `softDelete()`, no `id` field, no `createdBy` — schema doesn't have
 * those columns. The companion's lifecycle is bound to the parent's.
 *
 * Source: tenant_settings table.
 */
export class TenantSettings {
  #tenantId: TenantId
  #defaultCurrency: Currency
  #unitSystem: UnitSystem
  #dateFormat: string
  #timezone: string
  #inventorySettings: InventorySettings
  #createdAt: Date
  #updatedAt: Date
  #updatedBy: ProfileId | null

  private constructor(props: ReconstituteTenantSettingsProps) {
    this.#tenantId = props.tenantId
    this.#defaultCurrency = props.defaultCurrency
    this.#unitSystem = props.unitSystem
    this.#dateFormat = props.dateFormat
    this.#timezone = props.timezone
    this.#inventorySettings = { ...props.inventorySettings }
    this.#createdAt = props.createdAt
    this.#updatedAt = props.updatedAt
    this.#updatedBy = props.updatedBy
  }

  // ─── Factories ───────────────────────────────────────────────────────────

  /**
   * Construct a brand-new TenantSettings row. All fields default to the
   * same values the DB column defaults specify — the use case can pass
   * overrides for any of them (e.g., a tenant in Europe might want
   * `defaultCurrency: EUR`, `unitSystem: metric`, `dateFormat: DD/MM/YYYY`).
   */
  static create(props: CreateTenantSettingsProps, now: Date = new Date()): TenantSettings {
    const dateFormat = props.dateFormat ?? "MM/DD/YYYY"
    const timezone = props.timezone ?? "America/New_York"
    TenantSettings.#assertValidDateFormat(dateFormat)
    TenantSettings.#assertValidTimezone(timezone)
    return new TenantSettings({
      tenantId: props.tenantId,
      defaultCurrency: props.defaultCurrency ?? Currency.create("USD"),
      unitSystem: props.unitSystem ?? "metric",
      dateFormat,
      timezone,
      inventorySettings: { ...(props.inventorySettings ?? {}) },
      createdAt: now,
      updatedAt: now,
      updatedBy: null,
    })
  }

  static reconstitute(props: ReconstituteTenantSettingsProps): TenantSettings {
    return new TenantSettings(props)
  }

  static fromJSON(s: TenantSettingsSnapshot): TenantSettings {
    return TenantSettings.reconstitute({
      tenantId: TenantId.fromPersistence(s.tenantId),
      defaultCurrency: Currency.fromPersistence(s.defaultCurrency),
      unitSystem: s.unitSystem,
      dateFormat: s.dateFormat,
      timezone: s.timezone,
      inventorySettings: { ...s.inventorySettings },
      createdAt: new Date(s.createdAt),
      updatedAt: new Date(s.updatedAt),
      updatedBy: s.updatedBy ? ProfileId.fromPersistence(s.updatedBy) : null,
    })
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get tenantId(): TenantId {
    return this.#tenantId
  }
  get defaultCurrency(): Currency {
    return this.#defaultCurrency
  }
  get unitSystem(): UnitSystem {
    return this.#unitSystem
  }
  get dateFormat(): string {
    return this.#dateFormat
  }
  get timezone(): string {
    return this.#timezone
  }
  /** Read-only view of the inventory-settings jsonb. */
  get inventorySettings(): Readonly<InventorySettings> {
    return this.#inventorySettings
  }
  get createdAt(): Date {
    return this.#createdAt
  }
  get updatedAt(): Date {
    return this.#updatedAt
  }
  get updatedBy(): ProfileId | null {
    return this.#updatedBy
  }

  // ─── State transitions ───────────────────────────────────────────────────

  /**
   * Aggregated localization edit. Tenant settings UI usually shows
   * currency, unit system, date format, and timezone as one form panel
   * ("Regional preferences"); folding them into one method matches that
   * shape and gives one audit bump per save.
   */
  updateLocalization(
    defaultCurrency: Currency,
    unitSystem: UnitSystem,
    dateFormat: string,
    timezone: string,
    updatedBy: ProfileId,
    now: Date = new Date()
  ): void {
    TenantSettings.#assertValidDateFormat(dateFormat)
    TenantSettings.#assertValidTimezone(timezone)
    if (
      defaultCurrency.equals(this.#defaultCurrency) &&
      unitSystem === this.#unitSystem &&
      dateFormat === this.#dateFormat &&
      timezone === this.#timezone
    ) {
      return
    }
    this.#defaultCurrency = defaultCurrency
    this.#unitSystem = unitSystem
    this.#dateFormat = dateFormat
    this.#timezone = timezone
    this.#touchAudit(updatedBy, now)
  }

  /**
   * Replace the inventory-settings jsonb wholesale. Caller passes the
   * full new shape; the entity defensively copies. No deep merge — the
   * use case is responsible for reading current settings and merging
   * field-level edits before calling this.
   */
  updateInventorySettings(
    settings: InventorySettings,
    updatedBy: ProfileId,
    now: Date = new Date()
  ): void {
    if (sameInventorySettings(this.#inventorySettings, settings)) return
    this.#inventorySettings = { ...settings }
    this.#touchAudit(updatedBy, now)
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  #touchAudit(updatedBy: ProfileId, now: Date): void {
    this.#updatedAt = now
    this.#updatedBy = updatedBy
  }

  static #assertValidDateFormat(dateFormat: string): void {
    if (dateFormat.length === 0) {
      throw new InvalidEntityError("TenantSettings", "dateFormat must not be empty")
    }
    if (dateFormat.length > DATE_FORMAT_MAX_LENGTH) {
      throw new InvalidEntityError(
        "TenantSettings",
        `dateFormat must be ${DATE_FORMAT_MAX_LENGTH} characters or fewer`
      )
    }
  }

  static #assertValidTimezone(timezone: string): void {
    if (timezone.length === 0) {
      throw new InvalidEntityError("TenantSettings", "timezone must not be empty")
    }
    if (timezone.length > TIMEZONE_MAX_LENGTH) {
      throw new InvalidEntityError(
        "TenantSettings",
        `timezone must be ${TIMEZONE_MAX_LENGTH} characters or fewer`
      )
    }
    // No IANA name validation — too expensive (would need a static table)
    // and the boundary is the UI dropdown of valid timezones. Trusting
    // the caller here.
  }

  // ─── Serialization ───────────────────────────────────────────────────────

  toJSON(): TenantSettingsSnapshot {
    return {
      tenantId: this.#tenantId.value,
      defaultCurrency: this.#defaultCurrency.value,
      unitSystem: this.#unitSystem,
      dateFormat: this.#dateFormat,
      timezone: this.#timezone,
      inventorySettings: { ...this.#inventorySettings },
      createdAt: this.#createdAt.toISOString(),
      updatedAt: this.#updatedAt.toISOString(),
      updatedBy: this.#updatedBy?.value ?? null,
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sameInventorySettings(a: InventorySettings, b: InventorySettings): boolean {
  // Shallow JSON-equality check. Sufficient because InventorySettings
  // values are primitives or undefined.
  const keysA = Object.keys(a) as (keyof InventorySettings)[]
  const keysB = Object.keys(b) as (keyof InventorySettings)[]
  if (keysA.length !== keysB.length) return false
  return keysA.every((k) => a[k] === b[k])
}
