/**
 * assertBarcodeFormatAllowed unit tests.
 *
 * Pro-tier gate for non-default barcode formats. Today every roll
 * gets `code128` (DB CHECK constraint), so the helper short-circuits
 * on the format check before invoking `requireFeature`. These tests
 * pin the no-op + delegation behavior so a future schema widening
 * inherits the right gating without a second review pass.
 */
import { describe, expect, it, vi } from "vitest"

import type { ActionActor } from "@/src/application/types/action-actor"

const requireFeatureMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/auth/require-feature", () => ({
  requireFeature: requireFeatureMock,
}))

const ACTOR: ActionActor = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "owner@example.com",
  roles: ["admin"],
  isSuperAdmin: false,
}

describe("assertBarcodeFormatAllowed", () => {
  it("is a no-op when format is null/undefined (no smuggled value)", async () => {
    requireFeatureMock.mockClear()
    const { assertBarcodeFormatAllowed } = await import(
      "@/app/server/auth/assert-barcode-format-allowed"
    )
    await assertBarcodeFormatAllowed(ACTOR, null)
    await assertBarcodeFormatAllowed(ACTOR, undefined)
    expect(requireFeatureMock).not.toHaveBeenCalled()
  })

  it("is a no-op for the DB-default code128 format", async () => {
    requireFeatureMock.mockClear()
    const { assertBarcodeFormatAllowed } = await import(
      "@/app/server/auth/assert-barcode-format-allowed"
    )
    await assertBarcodeFormatAllowed(ACTOR, "code128")
    expect(requireFeatureMock).not.toHaveBeenCalled()
  })

  it("delegates to requireFeature for any non-default format", async () => {
    requireFeatureMock.mockClear()
    requireFeatureMock.mockResolvedValue(undefined)
    const { assertBarcodeFormatAllowed } = await import(
      "@/app/server/auth/assert-barcode-format-allowed"
    )
    await assertBarcodeFormatAllowed(ACTOR, "qr_code")
    expect(requireFeatureMock).toHaveBeenCalledWith(ACTOR, "custom_barcode_formats")
  })

  it("propagates FeatureLockedError from requireFeature unchanged", async () => {
    requireFeatureMock.mockClear()
    requireFeatureMock.mockRejectedValue(
      Object.assign(new Error("locked"), {
        code: "FEATURE_LOCKED",
        featureKey: "custom_barcode_formats",
      })
    )
    const { assertBarcodeFormatAllowed } = await import(
      "@/app/server/auth/assert-barcode-format-allowed"
    )
    await expect(assertBarcodeFormatAllowed(ACTOR, "ean13")).rejects.toMatchObject({
      code: "FEATURE_LOCKED",
      featureKey: "custom_barcode_formats",
    })
  })
})
