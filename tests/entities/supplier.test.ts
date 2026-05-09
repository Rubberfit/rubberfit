import { describe, expect, it } from "vitest"

import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { Supplier, type SupplierUpdateProps } from "@/src/entities/supplier"
import { Currency } from "@/src/entities/value-objects/currency"
import { Email } from "@/src/entities/value-objects/email"
import {
  AddressId,
  ProfileId,
  SupplierId,
  TenantId,
} from "@/src/entities/value-objects/id"
import { Money } from "@/src/entities/value-objects/money"

const SUPPLIER_UUID = "550e8400-e29b-41d4-a716-446655440000"
const TENANT_UUID = "00000000-0000-4000-8000-000000000010"
const ADDRESS_UUID = "00000000-0000-4000-8000-000000000020"
const ACTOR_UUID = "00000000-0000-4000-8000-000000000030"

const T0 = new Date("2026-05-09T12:00:00.000Z")
const T1 = new Date("2026-05-09T12:30:00.000Z")
const T2 = new Date("2026-05-09T13:00:00.000Z")

const USD = Currency.create("USD")
const EUR = Currency.create("EUR")

function makeSupplier(
  overrides: Partial<Parameters<typeof Supplier.create>[0]> = {},
) {
  return Supplier.create(
    {
      id: SupplierId.fromPersistence(SUPPLIER_UUID),
      tenantId: TenantId.fromPersistence(TENANT_UUID),
      name: "Acme Sign Supply",
      ...overrides,
    },
    T0,
  )
}

const baseUpdate: SupplierUpdateProps = {
  name: "Acme Sign Supply",
  addressId: null,
  email: null,
  generalPhone: null,
  website: null,
  taxId: null,
  taxRate: null,
  taxExempt: false,
  paymentTerms: null,
  shippingCost: null,
  rating: null,
  preferred: false,
  notes: null,
}

describe("Supplier", () => {
  describe("create()", () => {
    it("constructs with required fields and sensible defaults", () => {
      const s = makeSupplier()
      expect(s.id.value).toBe(SUPPLIER_UUID)
      expect(s.name).toBe("Acme Sign Supply")
      expect(s.addressId).toBeNull()
      expect(s.email).toBeNull()
      expect(s.taxExempt).toBe(false)
      expect(s.preferred).toBe(false)
      expect(s.isActive).toBe(true)
      expect(s.deletedAt).toBeNull()
    })

    it("accepts an Email VO", () => {
      const s = makeSupplier({ email: Email.create("hello@acme.com") })
      expect(s.email?.value).toBe("hello@acme.com")
    })

    it("accepts Money for shippingCost", () => {
      const s = makeSupplier({ shippingCost: Money.fromCents(2500, USD) })
      expect(s.shippingCost?.cents).toBe(2500)
      expect(s.shippingCost?.currency.value).toBe("USD")
    })

    it("accepts an AddressId FK", () => {
      const s = makeSupplier({
        addressId: AddressId.fromPersistence(ADDRESS_UUID),
      })
      expect(s.addressId?.value).toBe(ADDRESS_UUID)
    })

    it("trims name and free-text fields", () => {
      const s = makeSupplier({
        name: "  Acme  ",
        generalPhone: "  555-1234  ",
        notes: "  hello  ",
      })
      expect(s.name).toBe("Acme")
      expect(s.generalPhone).toBe("555-1234")
      expect(s.notes).toBe("hello")
    })

    it("rejects empty / overlong name", () => {
      expect(() => makeSupplier({ name: "" })).toThrow(InvalidEntityError)
      expect(() => makeSupplier({ name: "x".repeat(201) })).toThrow(
        InvalidEntityError,
      )
    })

    it("rejects website without http(s)", () => {
      expect(() => makeSupplier({ website: "acme.com" })).toThrow(
        InvalidEntityError,
      )
    })

    it("accepts website with http or https", () => {
      expect(makeSupplier({ website: "http://acme.com" }).website).toBe(
        "http://acme.com",
      )
      expect(makeSupplier({ website: "https://acme.com" }).website).toBe(
        "https://acme.com",
      )
    })

    it("rejects taxRate out of [0,1]", () => {
      expect(() => makeSupplier({ taxRate: -0.1 })).toThrow(InvalidEntityError)
      expect(() => makeSupplier({ taxRate: 1.5 })).toThrow(InvalidEntityError)
      expect(() => makeSupplier({ taxRate: NaN })).toThrow(InvalidEntityError)
    })

    it("accepts taxRate at boundaries 0 and 1", () => {
      expect(makeSupplier({ taxRate: 0 }).taxRate).toBe(0)
      expect(makeSupplier({ taxRate: 1 }).taxRate).toBe(1)
    })

    it("rejects rating out of 1..5 or non-integer", () => {
      expect(() => makeSupplier({ rating: 0 })).toThrow(InvalidEntityError)
      expect(() => makeSupplier({ rating: 6 })).toThrow(InvalidEntityError)
      expect(() => makeSupplier({ rating: 3.5 })).toThrow(InvalidEntityError)
    })

    it("rejects negative shippingCost", () => {
      expect(() =>
        makeSupplier({ shippingCost: Money.fromCents(-100, USD) }),
      ).toThrow(InvalidEntityError)
    })

    it.each([
      ["name", "x".repeat(201)],
      ["generalPhone", "x".repeat(31)],
      ["website", "https://" + "x".repeat(500)],
      ["taxId", "x".repeat(51)],
      ["paymentTerms", "x".repeat(201)],
    ])("rejects overlong %s", (field, value) => {
      const overrides: Partial<Parameters<typeof Supplier.create>[0]> = {
        [field]: value,
      }
      expect(() => makeSupplier(overrides)).toThrow(InvalidEntityError)
    })
  })

  describe("isActive vs isDeleted", () => {
    it("starts active and not deleted", () => {
      const s = makeSupplier()
      expect(s.isActive).toBe(true)
      expect(s.isDeleted).toBe(false)
    })

    it("deactivate flips isActive without setting deletedAt", () => {
      const s = makeSupplier()
      s.deactivate(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(s.isActive).toBe(false)
      expect(s.isDeleted).toBe(false)
    })

    it("softDelete sets deletedAt without flipping isActive", () => {
      const s = makeSupplier()
      s.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(s.isDeleted).toBe(true)
      expect(s.isActive).toBe(true)
    })
  })

  describe("deactivate / reactivate", () => {
    it("deactivate is idempotent", () => {
      const s = makeSupplier()
      s.deactivate(ProfileId.fromPersistence(ACTOR_UUID), T1)
      const beforeUpdatedAt = s.updatedAt
      s.deactivate(ProfileId.fromPersistence(ACTOR_UUID), T2)
      expect(s.updatedAt).toBe(beforeUpdatedAt)
    })

    it("reactivate restores isActive", () => {
      const s = makeSupplier()
      s.deactivate(ProfileId.fromPersistence(ACTOR_UUID), T1)
      s.reactivate(ProfileId.fromPersistence(ACTOR_UUID), T2)
      expect(s.isActive).toBe(true)
    })

    it("reactivate is idempotent on an active supplier", () => {
      const s = makeSupplier()
      const before = s.updatedAt
      s.reactivate(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(s.updatedAt).toBe(before)
    })

    it("deactivate rejects on a soft-deleted supplier", () => {
      const s = makeSupplier()
      s.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(() =>
        s.deactivate(ProfileId.fromPersistence(ACTOR_UUID), T2),
      ).toThrow(InvalidEntityError)
    })

    it("reactivate rejects on a soft-deleted supplier", () => {
      const s = makeSupplier()
      s.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(() =>
        s.reactivate(ProfileId.fromPersistence(ACTOR_UUID), T2),
      ).toThrow(InvalidEntityError)
    })
  })

  describe("updateDetails()", () => {
    it("bulk-edits all fields and bumps audit", () => {
      const s = makeSupplier()
      s.updateDetails(
        {
          ...baseUpdate,
          name: "Acme Refined",
          email: Email.create("ops@acme.com"),
          generalPhone: "555-9999",
          website: "https://acme.com",
          taxRate: 0.08,
          rating: 4,
          shippingCost: Money.fromCents(5000, USD),
          notes: "VIP",
        },
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(s.name).toBe("Acme Refined")
      expect(s.email?.value).toBe("ops@acme.com")
      expect(s.taxRate).toBe(0.08)
      expect(s.rating).toBe(4)
      expect(s.shippingCost?.cents).toBe(5000)
      expect(s.updatedAt).toEqual(T1)
    })

    it("no-op on full equality", () => {
      const s = makeSupplier()
      const before = s.updatedAt
      s.updateDetails(
        baseUpdate,
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(s.updatedAt).toBe(before)
    })

    it("rejects on deleted supplier", () => {
      const s = makeSupplier()
      s.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(() =>
        s.updateDetails(
          baseUpdate,
          ProfileId.fromPersistence(ACTOR_UUID),
          T2,
        ),
      ).toThrow(InvalidEntityError)
    })

    it("validation failure leaves entity unchanged", () => {
      const s = makeSupplier()
      const before = s.toJSON()
      expect(() =>
        s.updateDetails(
          { ...baseUpdate, name: "" },
          ProfileId.fromPersistence(ACTOR_UUID),
          T1,
        ),
      ).toThrow(InvalidEntityError)
      expect(s.toJSON()).toEqual(before)
    })

    it("does NOT touch isActive or deletedAt", () => {
      const s = makeSupplier()
      s.deactivate(ProfileId.fromPersistence(ACTOR_UUID), T1)
      s.updateDetails(
        { ...baseUpdate, name: "Renamed" },
        ProfileId.fromPersistence(ACTOR_UUID),
        T2,
      )
      expect(s.isActive).toBe(false)
    })
  })

  describe("softDelete()", () => {
    it("sets deletedAt + bumps audit", () => {
      const s = makeSupplier()
      s.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(s.deletedAt).toEqual(T1)
    })

    it("idempotent", () => {
      const s = makeSupplier()
      s.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      s.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T2)
      expect(s.deletedAt).toEqual(T1)
    })
  })

  describe("toJSON / fromJSON round-trip", () => {
    it("preserves all fields including Money + Email", () => {
      const s = makeSupplier({
        email: Email.create("hello@acme.com"),
        shippingCost: Money.fromCents(2500, USD),
        addressId: AddressId.fromPersistence(ADDRESS_UUID),
        rating: 5,
        preferred: true,
      })
      const snap = s.toJSON()
      expect(Supplier.fromJSON(snap).toJSON()).toEqual(snap)
    })

    it("Money round-trip carries currency", () => {
      const s = makeSupplier({ shippingCost: Money.fromCents(750, EUR) })
      const back = Supplier.fromJSON(s.toJSON())
      expect(back.shippingCost?.currency.value).toBe("EUR")
    })
  })
})
