import { ProfileId } from "@/src/entities/value-objects/id"
import type { UnitSystem } from "@/src/entities/tenant-settings"

// ─── JSONB shapes ──────────────────────────────────────────────────────────

/**
 * Per-user notification routing. Stored as `jsonb` so the shape can
 * evolve without migrations. Unknown fields round-trip through the
 * entity untouched.
 *
 * All fields optional — defaults applied at the use-case layer (or fall
 * back to tenant-level / global defaults).
 *
 * Per the original CLAUDE.md note, the canonical schema for these fields
 * lives in `src/types/notifications.ts`. The interface here is a minimal
 * stand-in until that file is wired through; the field names match.
 */
export interface NotificationPreferences {
  /** Send notifications via email channel. */
  emailEnabled?: boolean
  /** Show in-app notification banner / inbox entry. */
  inAppEnabled?: boolean
  /** Send via SMS (requires per-tenant SMS provider config). */
  smsEnabled?: boolean
  /** Quiet-hours start in HH:MM (24-hour). No notifications dispatched within window. */
  quietHoursStart?: string
  /** Quiet-hours end in HH:MM. */
  quietHoursEnd?: string
  /** IANA timezone the quiet-hours window is interpreted in. */
  quietHoursTimezone?: string
  /** Per-type opt-in overrides (e.g., `{ low_stock: true, cut_completed: false }`). */
  typeToggles?: Record<string, boolean>
}

/**
 * Per-user UI preferences. Includes overrides for tenant-level defaults
 * the user wants applied just to their session.
 */
export interface UiPreferences {
  /**
   * Override of the tenant's `unitSystem`. When unset, the tenant default
   * applies. Mostly useful for shop-floor users who prefer one unit
   * system regardless of the org default.
   */
  unitSystem?: UnitSystem
  /** Color theme for the dashboard chrome. */
  theme?: "light" | "dark" | "system"
  /** Whether the cutting-engine sidebar starts collapsed. */
  cuttingEngineSidebarCollapsed?: boolean
  /** Default landing route after sign-in (path string). */
  defaultLandingPath?: string
}

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateUserPreferencesProps {
  profileId: ProfileId
  notificationPreferences?: NotificationPreferences // default {}
  uiPreferences?: UiPreferences // default {}
}

export interface ReconstituteUserPreferencesProps {
  profileId: ProfileId
  notificationPreferences: NotificationPreferences
  uiPreferences: UiPreferences
  createdAt: Date
  updatedAt: Date
}

export interface UserPreferencesSnapshot {
  profileId: string
  notificationPreferences: NotificationPreferences
  uiPreferences: UiPreferences
  createdAt: string
  updatedAt: string
}

// ─── Entity ────────────────────────────────────────────────────────────────

/**
 * Per-user preferences. Shared-PK 1:1 companion to Profile — `profileId`
 * is both the entity identity AND the parent FK. Always exactly one row
 * per profile; `ON DELETE CASCADE` removes it when the profile is deleted.
 *
 * Aggregate boundary: separate from Profile. The use case (or auth-trigger
 * service) that creates a profile also creates this companion.
 *
 * Two jsonb fields cover the full surface: `notificationPreferences`
 * (channel routing + per-type toggles) and `uiPreferences` (chrome,
 * tenant-default overrides). They evolve independently — the entity
 * exposes a setter per field.
 *
 * No `softDelete()`, no `id` field, no `createdBy`, no `updatedBy` —
 * the rule is "users edit only their own preferences", so the editor
 * is always `profileId`. The use-case layer + RLS enforce that;
 * representing it on the entity would be redundant.
 *
 * Source: user_preferences table.
 */
export class UserPreferences {
  #profileId: ProfileId
  #notificationPreferences: NotificationPreferences
  #uiPreferences: UiPreferences
  #createdAt: Date
  #updatedAt: Date

  private constructor(props: ReconstituteUserPreferencesProps) {
    this.#profileId = props.profileId
    this.#notificationPreferences = { ...props.notificationPreferences }
    this.#uiPreferences = { ...props.uiPreferences }
    this.#createdAt = props.createdAt
    this.#updatedAt = props.updatedAt
  }

  // ─── Factories ───────────────────────────────────────────────────────────

  static create(props: CreateUserPreferencesProps, now: Date = new Date()): UserPreferences {
    return new UserPreferences({
      profileId: props.profileId,
      notificationPreferences: { ...(props.notificationPreferences ?? {}) },
      uiPreferences: { ...(props.uiPreferences ?? {}) },
      createdAt: now,
      updatedAt: now,
    })
  }

  static reconstitute(props: ReconstituteUserPreferencesProps): UserPreferences {
    return new UserPreferences(props)
  }

  static fromJSON(s: UserPreferencesSnapshot): UserPreferences {
    return UserPreferences.reconstitute({
      profileId: ProfileId.fromPersistence(s.profileId),
      notificationPreferences: { ...s.notificationPreferences },
      uiPreferences: { ...s.uiPreferences },
      createdAt: new Date(s.createdAt),
      updatedAt: new Date(s.updatedAt),
    })
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get profileId(): ProfileId {
    return this.#profileId
  }
  /** Read-only view of the notification-preferences jsonb. */
  get notificationPreferences(): Readonly<NotificationPreferences> {
    return this.#notificationPreferences
  }
  /** Read-only view of the UI preferences jsonb. */
  get uiPreferences(): Readonly<UiPreferences> {
    return this.#uiPreferences
  }
  get createdAt(): Date {
    return this.#createdAt
  }
  get updatedAt(): Date {
    return this.#updatedAt
  }

  // ─── State transitions ───────────────────────────────────────────────────

  /**
   * Replace notification preferences wholesale. Caller passes the full
   * new shape; the entity defensively copies. No deep merge — the use
   * case reads current prefs and merges field-level edits before calling.
   */
  updateNotificationPreferences(prefs: NotificationPreferences, now: Date = new Date()): void {
    if (sameJsonShape(this.#notificationPreferences, prefs)) return
    this.#notificationPreferences = { ...prefs }
    this.#updatedAt = now
  }

  /**
   * Replace UI preferences wholesale. Same merge-at-use-case-layer rule.
   */
  updateUiPreferences(prefs: UiPreferences, now: Date = new Date()): void {
    if (sameJsonShape(this.#uiPreferences, prefs)) return
    this.#uiPreferences = { ...prefs }
    this.#updatedAt = now
  }

  // ─── Serialization ───────────────────────────────────────────────────────

  toJSON(): UserPreferencesSnapshot {
    return {
      profileId: this.#profileId.value,
      notificationPreferences: { ...this.#notificationPreferences },
      uiPreferences: { ...this.#uiPreferences },
      createdAt: this.#createdAt.toISOString(),
      updatedAt: this.#updatedAt.toISOString(),
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Shallow-equality check between two flat jsonb-style objects. Adequate
 * because the typed shapes here are primitives + one nested
 * Record<string, boolean> (typeToggles). Deep diff would be more correct
 * but matches no real workflow yet.
 */
function sameJsonShape<T extends object>(a: T, b: T): boolean {
  const keysA = Object.keys(a) as (keyof T)[]
  const keysB = Object.keys(b) as (keyof T)[]
  if (keysA.length !== keysB.length) return false
  return keysA.every((k) => a[k] === b[k])
}
