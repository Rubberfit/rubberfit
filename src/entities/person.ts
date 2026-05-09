import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { nullableEqual } from "@/src/entities/shared/equality"
import {
  trimOptional,
  trimRequired,
} from "@/src/entities/shared/string-helpers"
import { Email } from "@/src/entities/value-objects/email"
import {
  PersonId,
  ProfileId,
  TenantId,
} from "@/src/entities/value-objects/id"

// ─── Constants (mirror DB column lengths) ──────────────────────────────────

const NAME_MAX = 100
const PHONE_MAX = 30

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface CreatePersonProps {
  id: PersonId
  tenantId: TenantId
  firstName: string
  lastName: string
  /** At least one of email / phone / mobile must be non-null. */
  email?: Email | null
  phone?: string | null
  mobile?: string | null
  notes?: string | null
  /** Optional link to a Profile if this person also has portal access. */
  profileId?: ProfileId | null
  createdBy?: ProfileId | null
}

export interface ReconstitutePersonProps {
  id: PersonId
  tenantId: TenantId
  profileId: ProfileId | null
  firstName: string
  lastName: string
  email: Email | null
  phone: string | null
  mobile: string | null
  notes: string | null
  createdAt: Date
  createdBy: ProfileId | null
  updatedAt: Date
  updatedBy: ProfileId | null
  deletedAt: Date | null
}

export interface PersonSnapshot {
  id: string
  tenantId: string
  profileId: string | null
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  mobile: string | null
  notes: string | null
  createdAt: string
  createdBy: string | null
  updatedAt: string
  updatedBy: string | null
  deletedAt: string | null
}

// ─── Entity ────────────────────────────────────────────────────────────────

/**
 * External contact (customer rep, supplier contact, job stakeholder),
 * tenant-scoped. Distinct from Profile — Person represents people who
 * may not have portal access. The optional `profileId` link lets us
 * mark "this person ALSO has a Platform account" when they do.
 *
 * The DB-level invariant `persons_has_contact` requires at least one of
 * `email`, `phone`, `mobile` to be non-null. This entity enforces the
 * same rule on `create()` and on the contact-info edit path. First
 * cross-field invariant the entity layer guards.
 *
 * Lifecycle:
 *   create(props)              → new row; enforces hasContact + lengths
 *   reconstitute(props)        → DB rehydration, no validation
 *   updateDetails(...)         → aggregated edit (name + contact + notes);
 *                                re-enforces hasContact
 *   linkProfile / unlinkProfile → manage the optional profileId association
 *   softDelete(...)            → terminal
 *
 * Source: persons table.
 */
export class Person {
  #id: PersonId
  #tenantId: TenantId
  #profileId: ProfileId | null
  #firstName: string
  #lastName: string
  #email: Email | null
  #phone: string | null
  #mobile: string | null
  #notes: string | null
  #createdAt: Date
  #createdBy: ProfileId | null
  #updatedAt: Date
  #updatedBy: ProfileId | null
  #deletedAt: Date | null

  private constructor(props: ReconstitutePersonProps) {
    this.#id = props.id
    this.#tenantId = props.tenantId
    this.#profileId = props.profileId
    this.#firstName = props.firstName
    this.#lastName = props.lastName
    this.#email = props.email
    this.#phone = props.phone
    this.#mobile = props.mobile
    this.#notes = props.notes
    this.#createdAt = props.createdAt
    this.#createdBy = props.createdBy
    this.#updatedAt = props.updatedAt
    this.#updatedBy = props.updatedBy
    this.#deletedAt = props.deletedAt
  }

  // ─── Factories ───────────────────────────────────────────────────────────

  static create(props: CreatePersonProps, now: Date = new Date()): Person {
    const firstName = trimRequired(props.firstName, "firstName", NAME_MAX, "Person")
    const lastName = trimRequired(props.lastName, "lastName", NAME_MAX, "Person")
    const phone = trimOptional(props.phone, "phone", PHONE_MAX, "Person")
    const mobile = trimOptional(props.mobile, "mobile", PHONE_MAX, "Person")
    const email = props.email ?? null
    const notes = trimOptional(props.notes, "notes", null, "Person")

    Person.#assertHasContact(email, phone, mobile)

    return new Person({
      id: props.id,
      tenantId: props.tenantId,
      profileId: props.profileId ?? null,
      firstName,
      lastName,
      email,
      phone,
      mobile,
      notes,
      createdAt: now,
      createdBy: props.createdBy ?? null,
      updatedAt: now,
      updatedBy: null,
      deletedAt: null,
    })
  }

  static reconstitute(props: ReconstitutePersonProps): Person {
    return new Person(props)
  }

  static fromJSON(s: PersonSnapshot): Person {
    return Person.reconstitute({
      id: PersonId.fromPersistence(s.id),
      tenantId: TenantId.fromPersistence(s.tenantId),
      profileId: s.profileId ? ProfileId.fromPersistence(s.profileId) : null,
      firstName: s.firstName,
      lastName: s.lastName,
      email: s.email ? Email.fromPersistence(s.email) : null,
      phone: s.phone,
      mobile: s.mobile,
      notes: s.notes,
      createdAt: new Date(s.createdAt),
      createdBy: s.createdBy ? ProfileId.fromPersistence(s.createdBy) : null,
      updatedAt: new Date(s.updatedAt),
      updatedBy: s.updatedBy ? ProfileId.fromPersistence(s.updatedBy) : null,
      deletedAt: s.deletedAt ? new Date(s.deletedAt) : null,
    })
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get id(): PersonId { return this.#id }
  get tenantId(): TenantId { return this.#tenantId }
  get profileId(): ProfileId | null { return this.#profileId }
  get firstName(): string { return this.#firstName }
  get lastName(): string { return this.#lastName }
  get email(): Email | null { return this.#email }
  get phone(): string | null { return this.#phone }
  get mobile(): string | null { return this.#mobile }
  get notes(): string | null { return this.#notes }
  get createdAt(): Date { return this.#createdAt }
  get createdBy(): ProfileId | null { return this.#createdBy }
  get updatedAt(): Date { return this.#updatedAt }
  get updatedBy(): ProfileId | null { return this.#updatedBy }
  get deletedAt(): Date | null { return this.#deletedAt }

  // ─── State queries ───────────────────────────────────────────────────────

  get isDeleted(): boolean {
    return this.#deletedAt !== null
  }

  get hasPortalAccount(): boolean {
    return this.#profileId !== null
  }

  get fullName(): string {
    return `${this.#firstName} ${this.#lastName}`
  }

  // ─── State transitions ───────────────────────────────────────────────────

  /**
   * Aggregated whole-record edit. Person forms in the UI typically save
   * name + contact info + notes together; one method gives one audit
   * bump per save and re-enforces the multi-field invariant.
   *
   * The hasContact invariant (at least one of email/phone/mobile)
   * is checked AFTER applying changes — if a caller clears all three,
   * this throws and the entity stays in its pre-call state.
   */
  updateDetails(
    firstName: string,
    lastName: string,
    email: Email | null,
    phone: string | null,
    mobile: string | null,
    notes: string | null,
    updatedBy: ProfileId,
    now: Date = new Date(),
  ): void {
    this.#assertNotDeleted("update details")
    const newFirst = trimRequired(firstName, "firstName", NAME_MAX, "Person")
    const newLast = trimRequired(lastName, "lastName", NAME_MAX, "Person")
    const newPhone = trimOptional(phone, "phone", PHONE_MAX, "Person")
    const newMobile = trimOptional(mobile, "mobile", PHONE_MAX, "Person")
    const newNotes = trimOptional(notes, "notes", null, "Person")

    Person.#assertHasContact(email, newPhone, newMobile)

    if (
      newFirst === this.#firstName &&
      newLast === this.#lastName &&
      nullableEqual(email, this.#email) &&
      newPhone === this.#phone &&
      newMobile === this.#mobile &&
      newNotes === this.#notes
    ) {
      return
    }

    this.#firstName = newFirst
    this.#lastName = newLast
    this.#email = email
    this.#phone = newPhone
    this.#mobile = newMobile
    this.#notes = newNotes
    this.#touchAudit(updatedBy, now)
  }

  /**
   * Mark this person as also having a portal account. The use case is
   * responsible for verifying the profile actually exists + belongs to
   * a tenant the person is in (cross-aggregate concern).
   *
   * Idempotent if already linked to the same profile; throws if linked
   * to a different one (an explicit `unlinkProfile` is required first
   * to make the swap intentional).
   */
  linkProfile(
    profileId: ProfileId,
    updatedBy: ProfileId,
    now: Date = new Date(),
  ): void {
    this.#assertNotDeleted("link profile")
    if (this.#profileId !== null) {
      if (this.#profileId.equals(profileId)) return
      throw new InvalidEntityError(
        "Person",
        "already linked to a different profile; call unlinkProfile() first",
      )
    }
    this.#profileId = profileId
    this.#touchAudit(updatedBy, now)
  }

  /** Remove the profile association (the user lost portal access). Idempotent. */
  unlinkProfile(updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("unlink profile")
    if (this.#profileId === null) return
    this.#profileId = null
    this.#touchAudit(updatedBy, now)
  }

  /**
   * Soft-delete. Existing FKs (jobs.person_id, supplier_contacts.person_id,
   * etc.) keep their reference. Idempotent.
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
        "Person",
        `cannot ${operation} on a deleted person`,
      )
    }
  }

  /**
   * Multi-field invariant — at least one of email/phone/mobile must be
   * non-null. Mirrors the DB CHECK `persons_has_contact`. Throws on
   * violation so the entity stays in a consistent state.
   */
  static #assertHasContact(
    email: Email | null,
    phone: string | null,
    mobile: string | null,
  ): void {
    if (email === null && phone === null && mobile === null) {
      throw new InvalidEntityError(
        "Person",
        "must have at least one contact method (email, phone, or mobile)",
      )
    }
  }

  // ─── Serialization ───────────────────────────────────────────────────────

  toJSON(): PersonSnapshot {
    return {
      id: this.#id.value,
      tenantId: this.#tenantId.value,
      profileId: this.#profileId?.value ?? null,
      firstName: this.#firstName,
      lastName: this.#lastName,
      email: this.#email?.value ?? null,
      phone: this.#phone,
      mobile: this.#mobile,
      notes: this.#notes,
      createdAt: this.#createdAt.toISOString(),
      createdBy: this.#createdBy?.value ?? null,
      updatedAt: this.#updatedAt.toISOString(),
      updatedBy: this.#updatedBy?.value ?? null,
      deletedAt: this.#deletedAt?.toISOString() ?? null,
    }
  }
}

