import { InvalidValueObjectError } from "@/src/entities/errors/invalid-value-object.error"

/**
 * RFC-4122 UUID format check. Intentionally permissive on version (Supabase
 * emits v4 via gen_random_uuid(), but this accepts any RFC-shaped UUID —
 * strict v4 enforcement has no payoff over the DB UNIQUE constraint).
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value)
}

// ─── Generic Id ────────────────────────────────────────────────────────────

/**
 * Generic UUID-backed identifier. All entity IDs in the domain are GUIDs,
 * so a single class carries the validation + equality + serialization
 * behavior; per-entity distinctions are provided by the phantom `Brand`
 * type parameter, not by separate runtime classes.
 *
 * Nominal typing via phantom brand:
 *   const tid: TenantId = TenantId.create(uuid)
 *   const pid: ProfileId = tid   // ❌ compile error — phantom brand differs
 *
 * Lifecycle:
 *   create(value)          → user-supplied; validates UUID format, throws on bad input
 *   fromPersistence(value) → DB-sourced; trusted, no validation
 */
export class Id<Brand extends string = string> {
  public readonly value: string

  // Phantom field — never assigned at runtime, exists only for nominal
  // typing so Id<"Tenant"> and Id<"Profile"> aren't structurally equal.
  declare private readonly __brand: Brand

  private constructor(value: string) {
    this.value = value
  }

  /**
   * Validate + construct. `entityName` is the label used in the error
   * message (e.g., "TenantId", "ProfileId") so failures point to the
   * specific ID type that rejected the input.
   */
  static create<B extends string>(value: string, entityName: B): Id<B> {
    if (!isUuid(value)) {
      throw new InvalidValueObjectError(
        `${entityName}Id`,
        "expected a UUID",
        value,
      )
    }
    return new Id<B>(value)
  }

  /**
   * Reconstruct from a trusted source (DB row, snapshot). No validation
   * — if the DB has bad data we want to surface that as a downstream
   * error, not silently coerce here.
   */
  static fromPersistence<B extends string>(value: string): Id<B> {
    return new Id<B>(value)
  }

  equals(other: Id<Brand> | null | undefined): boolean {
    if (!other) return false
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }

  toJSON(): string {
    return this.value
  }
}

// ─── Per-entity factories ──────────────────────────────────────────────────

// Type alias + const factory pattern: `TenantId` works as both a type
// (`profile.tenantId: TenantId`) and a value (`TenantId.fromPersistence(s.id)`),
// so no call sites change when consolidating.

/** Identifier for a tenant (organization/workspace). Source: tenants.id. */
export type TenantId = Id<"Tenant">
export const TenantId = {
  create: (value: string): TenantId => Id.create(value, "Tenant"),
  fromPersistence: (value: string): TenantId =>
    Id.fromPersistence<"Tenant">(value),
}

/**
 * Identifier for a user profile. Source: profiles.id (shared PK with
 * auth.users.id, so a ProfileId is also the underlying auth user id).
 */
export type ProfileId = Id<"Profile">
export const ProfileId = {
  create: (value: string): ProfileId => Id.create(value, "Profile"),
  fromPersistence: (value: string): ProfileId =>
    Id.fromPersistence<"Profile">(value),
}

/** Identifier for a (tenant, profile) membership row. Source: memberships.id. */
export type MembershipId = Id<"Membership">
export const MembershipId = {
  create: (value: string): MembershipId => Id.create(value, "Membership"),
  fromPersistence: (value: string): MembershipId =>
    Id.fromPersistence<"Membership">(value),
}

/** Identifier for an invitation row. Source: invitations.id. */
export type InvitationId = Id<"Invitation">
export const InvitationId = {
  create: (value: string): InvitationId => Id.create(value, "Invitation"),
  fromPersistence: (value: string): InvitationId =>
    Id.fromPersistence<"Invitation">(value),
}

/** Identifier for a billing plan. Source: plans.id (global, not tenant-scoped). */
export type PlanId = Id<"Plan">
export const PlanId = {
  create: (value: string): PlanId => Id.create(value, "Plan"),
  fromPersistence: (value: string): PlanId =>
    Id.fromPersistence<"Plan">(value),
}

/** Identifier for a tenant subscription. Source: subscriptions.id. */
export type SubscriptionId = Id<"Subscription">
export const SubscriptionId = {
  create: (value: string): SubscriptionId =>
    Id.create(value, "Subscription"),
  fromPersistence: (value: string): SubscriptionId =>
    Id.fromPersistence<"Subscription">(value),
}

/** Identifier for an address row. Source: addresses.id (tenant-scoped). */
export type AddressId = Id<"Address">
export const AddressId = {
  create: (value: string): AddressId => Id.create(value, "Address"),
  fromPersistence: (value: string): AddressId =>
    Id.fromPersistence<"Address">(value),
}

/** Identifier for an external contact record. Source: persons.id (tenant-scoped). */
export type PersonId = Id<"Person">
export const PersonId = {
  create: (value: string): PersonId => Id.create(value, "Person"),
  fromPersistence: (value: string): PersonId =>
    Id.fromPersistence<"Person">(value),
}

/** Identifier for a material type (catalog category). Source: material_types.id. */
export type MaterialTypeId = Id<"MaterialType">
export const MaterialTypeId = {
  create: (value: string): MaterialTypeId =>
    Id.create(value, "MaterialType"),
  fromPersistence: (value: string): MaterialTypeId =>
    Id.fromPersistence<"MaterialType">(value),
}

/** Identifier for a supplier. Source: suppliers.id. */
export type SupplierId = Id<"Supplier">
export const SupplierId = {
  create: (value: string): SupplierId => Id.create(value, "Supplier"),
  fromPersistence: (value: string): SupplierId =>
    Id.fromPersistence<"Supplier">(value),
}

/** Identifier for a supplier-contact (supplier ↔ person join row). Source: supplier_contacts.id. */
export type SupplierContactId = Id<"SupplierContact">
export const SupplierContactId = {
  create: (value: string): SupplierContactId =>
    Id.create(value, "SupplierContact"),
  fromPersistence: (value: string): SupplierContactId =>
    Id.fromPersistence<"SupplierContact">(value),
}

/** Identifier for a material/supplier pricing row. Source: material_suppliers.id. */
export type MaterialSupplierId = Id<"MaterialSupplier">
export const MaterialSupplierId = {
  create: (value: string): MaterialSupplierId =>
    Id.create(value, "MaterialSupplier"),
  fromPersistence: (value: string): MaterialSupplierId =>
    Id.fromPersistence<"MaterialSupplier">(value),
}

/** Identifier for a physical roll of stock. Source: rolls.id. */
export type RollId = Id<"Roll">
export const RollId = {
  create: (value: string): RollId => Id.create(value, "Roll"),
  fromPersistence: (value: string): RollId =>
    Id.fromPersistence<"Roll">(value),
}

/** Identifier for a price-history audit row. Source: price_history.id. */
export type PriceHistoryId = Id<"PriceHistory">
export const PriceHistoryId = {
  create: (value: string): PriceHistoryId =>
    Id.create(value, "PriceHistory"),
  fromPersistence: (value: string): PriceHistoryId =>
    Id.fromPersistence<"PriceHistory">(value),
}

/** Identifier for a reorder rule (one per material type). Source: reorder_rules.id. */
export type ReorderRuleId = Id<"ReorderRule">
export const ReorderRuleId = {
  create: (value: string): ReorderRuleId =>
    Id.create(value, "ReorderRule"),
  fromPersistence: (value: string): ReorderRuleId =>
    Id.fromPersistence<"ReorderRule">(value),
}

/** Identifier for a single cut operation (granular cut log). Source: cuts.id. */
export type CutId = Id<"Cut">
export const CutId = {
  create: (value: string): CutId => Id.create(value, "Cut"),
  fromPersistence: (value: string): CutId =>
    Id.fromPersistence<"Cut">(value),
}

/** Identifier for a job-level cut history record (with layout + metrics). Source: cut_history.id. */
export type CutHistoryId = Id<"CutHistory">
export const CutHistoryId = {
  create: (value: string): CutHistoryId =>
    Id.create(value, "CutHistory"),
  fromPersistence: (value: string): CutHistoryId =>
    Id.fromPersistence<"CutHistory">(value),
}

/** Identifier for a user's bookmark of a cut history row. Source: cut_favorites.id. */
export type CutFavoriteId = Id<"CutFavorite">
export const CutFavoriteId = {
  create: (value: string): CutFavoriteId =>
    Id.create(value, "CutFavorite"),
  fromPersistence: (value: string): CutFavoriteId =>
    Id.fromPersistence<"CutFavorite">(value),
}
