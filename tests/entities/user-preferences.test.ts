import { describe, expect, it } from "vitest"

import { UserPreferences } from "@/src/entities/user-preferences"
import { ProfileId } from "@/src/entities/value-objects/id"

const PROFILE_UUID = "550e8400-e29b-41d4-a716-446655440000"

const T0 = new Date("2026-05-09T12:00:00.000Z")
const T1 = new Date("2026-05-09T12:30:00.000Z")

function makePrefs(
  overrides: Partial<Parameters<typeof UserPreferences.create>[0]> = {},
) {
  return UserPreferences.create(
    {
      profileId: ProfileId.fromPersistence(PROFILE_UUID),
      ...overrides,
    },
    T0,
  )
}

describe("UserPreferences", () => {
  describe("create()", () => {
    it("applies empty-jsonb defaults", () => {
      const p = makePrefs()
      expect(p.profileId.value).toBe(PROFILE_UUID)
      expect(p.notificationPreferences).toEqual({})
      expect(p.uiPreferences).toEqual({})
    })

    it("accepts overrides", () => {
      const p = makePrefs({
        notificationPreferences: { emailEnabled: true, smsEnabled: false },
        uiPreferences: { theme: "dark" },
      })
      expect(p.notificationPreferences.emailEnabled).toBe(true)
      expect(p.uiPreferences.theme).toBe("dark")
    })

    it("does NOT have id or updatedBy fields", () => {
      const p = makePrefs()
      // profileId is the entity identity
      expect("id" in p).toBe(false)
      // updatedBy was removed (self-edit-only rule)
      expect("updatedBy" in p).toBe(false)
    })
  })

  describe("updateNotificationPreferences()", () => {
    it("replaces wholesale and bumps updatedAt", () => {
      const p = makePrefs({
        notificationPreferences: { emailEnabled: true },
      })
      p.updateNotificationPreferences({ inAppEnabled: true }, T1)
      expect(p.notificationPreferences.inAppEnabled).toBe(true)
      expect(p.notificationPreferences.emailEnabled).toBeUndefined()
      expect(p.updatedAt).toEqual(T1)
    })

    it("no-op on shape equality", () => {
      const p = makePrefs({
        notificationPreferences: { emailEnabled: true },
      })
      const before = p.updatedAt
      p.updateNotificationPreferences({ emailEnabled: true }, T1)
      expect(p.updatedAt).toBe(before)
    })

    it("input is defensively copied", () => {
      const input = { emailEnabled: false }
      const p = makePrefs()
      p.updateNotificationPreferences(input, T1)
      input.emailEnabled = true
      expect(p.notificationPreferences.emailEnabled).toBe(false)
    })
  })

  describe("updateUiPreferences()", () => {
    it("replaces wholesale and bumps updatedAt", () => {
      const p = makePrefs({
        uiPreferences: { theme: "light" },
      })
      p.updateUiPreferences({ theme: "dark" }, T1)
      expect(p.uiPreferences.theme).toBe("dark")
      expect(p.updatedAt).toEqual(T1)
    })

    it("no-op on shape equality", () => {
      const p = makePrefs({
        uiPreferences: { theme: "system" },
      })
      const before = p.updatedAt
      p.updateUiPreferences({ theme: "system" }, T1)
      expect(p.updatedAt).toBe(before)
    })

    it("notification + UI prefs are independent", () => {
      const p = makePrefs({
        notificationPreferences: { emailEnabled: true },
        uiPreferences: { theme: "light" },
      })
      p.updateUiPreferences({ theme: "dark" }, T1)
      // notification side untouched
      expect(p.notificationPreferences.emailEnabled).toBe(true)
    })
  })

  describe("toJSON / fromJSON round-trip", () => {
    it("preserves all fields", () => {
      const original = makePrefs({
        notificationPreferences: {
          emailEnabled: true,
          quietHoursStart: "22:00",
          quietHoursEnd: "07:00",
        },
        uiPreferences: { theme: "dark", cuttingEngineSidebarCollapsed: true },
      })
      const snapshot = original.toJSON()
      expect(UserPreferences.fromJSON(snapshot).toJSON()).toEqual(snapshot)
    })

    it("snapshot has no id/updatedBy fields", () => {
      const out = makePrefs().toJSON()
      expect("id" in out).toBe(false)
      expect("updatedBy" in out).toBe(false)
    })

    it("snapshot defensively copies the jsonb", () => {
      const p = makePrefs({
        notificationPreferences: { emailEnabled: true },
      })
      const s = p.toJSON()
      s.notificationPreferences.emailEnabled = false
      expect(p.notificationPreferences.emailEnabled).toBe(true)
    })
  })
})
