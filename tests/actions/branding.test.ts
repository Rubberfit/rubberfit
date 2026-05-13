/**
 * branding action tests — getBrandedPdfCompanyName.
 *
 * What we're enforcing:
 *   - Gate order: requireAuthenticatedUser → requireActiveSubscription
 *     → requireFeature("branded_pdfs"). Each must run; the feature
 *     gate is the architecture-test-tracked enforcement point.
 *   - Pro+ tier resolves to the org's `name`.
 *   - Standard tier throws FeatureLockedError (client treats as
 *     "fall back to DEFAULT_PDF_COMPANY_NAME").
 *   - Defensive fallback: if the org row is missing `name` or the
 *     org id, the action returns the default product name rather
 *     than empty/null.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ActionActor } from "@/src/application/types/action-actor"

const requireAuthenticatedUserMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/auth/require-authenticated-user", () => ({
  requireAuthenticatedUser: requireAuthenticatedUserMock,
}))

const requireActiveSubscriptionMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/auth/require-active-subscription", () => ({
  requireActiveSubscription: requireActiveSubscriptionMock,
}))

class FeatureLockedErrorMock extends Error {
  readonly code = "FEATURE_LOCKED" as const
  readonly featureKey: string
  readonly requiredTier: string
  readonly currentTier: string
  constructor(p: { featureKey: string; requiredTier: string; currentTier: string }) {
    super("locked")
    this.featureKey = p.featureKey
    this.requiredTier = p.requiredTier
    this.currentTier = p.currentTier
  }
}
const requireFeatureMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/auth/require-feature", () => ({
  requireFeature: requireFeatureMock,
  FeatureLockedError: FeatureLockedErrorMock,
}))

const ensureDatabaseFactoryRegisteredMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/database/register-factory", () => ({
  ensureDatabaseFactoryRegistered: ensureDatabaseFactoryRegisteredMock,
}))

const getOrganizationByIdMock = vi.hoisted(() => vi.fn())
vi.mock("@/src/infrastructure/services/organizationService", () => ({
  organizationService: {
    getOrganizationById: getOrganizationByIdMock,
  },
}))

const ACTOR: ActionActor = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "owner@example.com",
  roles: ["admin"],
  isSuperAdmin: false,
}

function allowedGate(planTier: "standard" | "pro" | "max" | "enterprise") {
  return {
    kind: "allowed" as const,
    organizationId: "org_1",
    subscriptionId: "sub_1",
    status: "active" as const,
    planTier,
    cancelAtPeriodEnd: false,
    cancelAt: null,
    currentPeriodEnd: null,
  }
}

describe("app/actions/branding.getBrandedPdfCompanyName", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuthenticatedUserMock.mockResolvedValue(ACTOR)
    requireActiveSubscriptionMock.mockResolvedValue(allowedGate("pro"))
    requireFeatureMock.mockResolvedValue(undefined)
  })

  it("calls auth + active-sub + feature gates in order", async () => {
    getOrganizationByIdMock.mockResolvedValue({ id: "org_1", name: "Acme Rubber" })
    const { getBrandedPdfCompanyName } = await import("@/app/actions/branding")
    await getBrandedPdfCompanyName()

    expect(requireAuthenticatedUserMock).toHaveBeenCalled()
    expect(requireActiveSubscriptionMock).toHaveBeenCalledWith(ACTOR)
    expect(requireFeatureMock).toHaveBeenCalledWith(ACTOR, "branded_pdfs")
  })

  it("returns the org's name for Pro+ actors", async () => {
    getOrganizationByIdMock.mockResolvedValue({ id: "org_1", name: "Acme Rubber Co." })
    const { getBrandedPdfCompanyName } = await import("@/app/actions/branding")

    await expect(getBrandedPdfCompanyName()).resolves.toEqual({
      ok: true,
      companyName: "Acme Rubber Co.",
    })
    expect(getOrganizationByIdMock).toHaveBeenCalledWith("org_1")
  })

  it("returns a discriminated FEATURE_LOCKED result for Standard tier", async () => {
    requireFeatureMock.mockRejectedValue(
      new FeatureLockedErrorMock({
        featureKey: "branded_pdfs",
        requiredTier: "pro",
        currentTier: "standard",
      })
    )
    const { getBrandedPdfCompanyName } = await import("@/app/actions/branding")

    await expect(getBrandedPdfCompanyName()).resolves.toEqual({
      ok: false,
      reason: "FEATURE_LOCKED",
    })
    expect(getOrganizationByIdMock).not.toHaveBeenCalled()
  })

  it("returns DEFAULT_PDF_COMPANY_NAME if org row is missing", async () => {
    getOrganizationByIdMock.mockResolvedValue(null)
    const { getBrandedPdfCompanyName } = await import("@/app/actions/branding")
    const { DEFAULT_PDF_COMPANY_NAME } = await import(
      "@/src/application/billing/pdf-branding"
    )

    await expect(getBrandedPdfCompanyName()).resolves.toEqual({
      ok: true,
      companyName: DEFAULT_PDF_COMPANY_NAME,
    })
  })

  it("returns DEFAULT_PDF_COMPANY_NAME if org has empty name", async () => {
    getOrganizationByIdMock.mockResolvedValue({ id: "org_1", name: "   " })
    const { getBrandedPdfCompanyName } = await import("@/app/actions/branding")
    const { DEFAULT_PDF_COMPANY_NAME } = await import(
      "@/src/application/billing/pdf-branding"
    )

    await expect(getBrandedPdfCompanyName()).resolves.toEqual({
      ok: true,
      companyName: DEFAULT_PDF_COMPANY_NAME,
    })
  })

  it("returns DEFAULT_PDF_COMPANY_NAME if active-sub gate returns no org id", async () => {
    requireActiveSubscriptionMock.mockResolvedValue({
      ...allowedGate("pro"),
      organizationId: null,
    })
    const { getBrandedPdfCompanyName } = await import("@/app/actions/branding")
    const { DEFAULT_PDF_COMPANY_NAME } = await import(
      "@/src/application/billing/pdf-branding"
    )

    await expect(getBrandedPdfCompanyName()).resolves.toEqual({
      ok: true,
      companyName: DEFAULT_PDF_COMPANY_NAME,
    })
    expect(getOrganizationByIdMock).not.toHaveBeenCalled()
  })
})
