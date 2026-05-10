import { describe, expect, it } from "vitest"

import { InvalidValueObjectError } from "@/src/entities/errors/invalid-value-object.error"
import {
  AddressId,
  CutFavoriteId,
  CutHistoryId,
  CutId,
  Id,
  InvitationId,
  MaterialSupplierId,
  MaterialTypeId,
  MembershipId,
  PersonId,
  PlanId,
  PriceHistoryId,
  ProfileId,
  ReorderRuleId,
  RollId,
  SubscriptionId,
  SupplierContactId,
  SupplierId,
  TenantId,
  isUuid,
} from "@/src/entities/value-objects/id"

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000"
const ANOTHER_UUID = "f47ac10b-58cc-4372-a567-0e02b2c3d479"
const UPPERCASE_UUID = "550E8400-E29B-41D4-A716-446655440000"

describe("isUuid()", () => {
  it("accepts a well-formed UUID", () => {
    expect(isUuid(VALID_UUID)).toBe(true)
  })

  it("accepts uppercase hex", () => {
    expect(isUuid(UPPERCASE_UUID)).toBe(true)
  })

  it.each([
    ["empty string", ""],
    ["truncated", "550e8400-e29b-41d4-a716"],
    ["no dashes", "550e8400e29b41d4a716446655440000"],
    ["wrong char in hex group", "550e8400-e29b-41d4-a716-44665544XXXX"],
    ["surrounding whitespace", ` ${VALID_UUID} `],
  ])("rejects malformed string: %s", (_label, input) => {
    expect(isUuid(input)).toBe(false)
  })

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["number", 123],
    ["object", {}],
    ["array", [VALID_UUID]],
  ])("rejects non-string input: %s", (_label, input) => {
    expect(isUuid(input)).toBe(false)
  })
})

describe("Id factories (TenantId / ProfileId / MembershipId / InvitationId)", () => {
  describe("create()", () => {
    it("validates and constructs from a valid UUID", () => {
      const id = TenantId.create(VALID_UUID)
      expect(id.value).toBe(VALID_UUID)
    })

    it("throws InvalidValueObjectError on bad input", () => {
      expect(() => ProfileId.create("not-a-uuid")).toThrow(
        InvalidValueObjectError,
      )
    })

    it("error includes the entity-specific VO name", () => {
      try {
        MembershipId.create("bad")
        throw new Error("expected throw")
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidValueObjectError)
        const e = err as InvalidValueObjectError
        expect(e.valueObject).toBe("MembershipId")
        expect(e.code).toBe("INVALID_VALUE_OBJECT")
        expect(e.receivedValue).toBe("bad")
      }
    })

    it("each factory uses its own label in the error", () => {
      const labels: Record<string, () => unknown> = {
        TenantId: () => TenantId.create("x"),
        ProfileId: () => ProfileId.create("x"),
        MembershipId: () => MembershipId.create("x"),
        InvitationId: () => InvitationId.create("x"),
        PlanId: () => PlanId.create("x"),
        SubscriptionId: () => SubscriptionId.create("x"),
        AddressId: () => AddressId.create("x"),
        PersonId: () => PersonId.create("x"),
        MaterialTypeId: () => MaterialTypeId.create("x"),
        SupplierId: () => SupplierId.create("x"),
        SupplierContactId: () => SupplierContactId.create("x"),
        MaterialSupplierId: () => MaterialSupplierId.create("x"),
        RollId: () => RollId.create("x"),
        PriceHistoryId: () => PriceHistoryId.create("x"),
        ReorderRuleId: () => ReorderRuleId.create("x"),
        CutId: () => CutId.create("x"),
        CutHistoryId: () => CutHistoryId.create("x"),
        CutFavoriteId: () => CutFavoriteId.create("x"),
      }
      for (const [expectedLabel, fn] of Object.entries(labels)) {
        expect(fn).toThrow(InvalidValueObjectError)
        try {
          fn()
        } catch (err) {
          expect((err as InvalidValueObjectError).valueObject).toBe(
            expectedLabel,
          )
        }
      }
    })
  })

  describe("fromPersistence()", () => {
    it("reconstructs without validation", () => {
      // Trusts DB — passing a non-UUID string would normally fail create()
      // but fromPersistence skips the regex check.
      const id = TenantId.fromPersistence("not-validated-here")
      expect(id.value).toBe("not-validated-here")
    })

    it("returns an Id instance with the same value", () => {
      const id = ProfileId.fromPersistence(VALID_UUID)
      expect(id).toBeInstanceOf(Id)
      expect(id.value).toBe(VALID_UUID)
    })
  })

  describe("equals()", () => {
    it("is true for same value", () => {
      const a = TenantId.fromPersistence(VALID_UUID)
      const b = TenantId.fromPersistence(VALID_UUID)
      expect(a.equals(b)).toBe(true)
    })

    it("is false for different value", () => {
      const a = TenantId.fromPersistence(VALID_UUID)
      const b = TenantId.fromPersistence(ANOTHER_UUID)
      expect(a.equals(b)).toBe(false)
    })

    it("is false for null/undefined", () => {
      const a = TenantId.fromPersistence(VALID_UUID)
      expect(a.equals(null)).toBe(false)
      expect(a.equals(undefined)).toBe(false)
    })

    it("is reflexive", () => {
      const a = TenantId.fromPersistence(VALID_UUID)
      expect(a.equals(a)).toBe(true)
    })
  })

  describe("serialization", () => {
    it("toString() returns the raw UUID", () => {
      const id = TenantId.create(VALID_UUID)
      expect(id.toString()).toBe(VALID_UUID)
    })

    it("toJSON() returns the raw UUID (JSON.stringify produces a string, not an object)", () => {
      const id = TenantId.create(VALID_UUID)
      expect(JSON.stringify(id)).toBe(`"${VALID_UUID}"`)
    })
  })

  describe("runtime shape", () => {
    it("all branded factories produce instances of the same Id class", () => {
      const factories = [
        TenantId,
        ProfileId,
        MembershipId,
        InvitationId,
        PlanId,
        SubscriptionId,
        AddressId,
        PersonId,
        MaterialTypeId,
        SupplierId,
        SupplierContactId,
        MaterialSupplierId,
        RollId,
        PriceHistoryId,
        ReorderRuleId,
        CutId,
        CutHistoryId,
        CutFavoriteId,
      ] as const
      // Phantom branding is type-only; at runtime they're all the same class.
      for (const factory of factories) {
        expect(factory.fromPersistence(VALID_UUID)).toBeInstanceOf(Id)
      }
    })
  })
})
