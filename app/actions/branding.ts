"use server"

import { DEFAULT_PDF_COMPANY_NAME } from "@/src/application/billing/pdf-branding"
import { organizationService } from "@/src/infrastructure/services/organizationService"

import { requireActiveSubscription } from "@/app/server/auth/require-active-subscription"
import { requireAuthenticatedUser } from "@/app/server/auth/require-authenticated-user"
import { FeatureLockedError, requireFeature } from "@/app/server/auth/require-feature"
import { ensureDatabaseFactoryRegistered } from "@/app/server/database/register-factory"

export type BrandedPdfCompanyNameResult =
  | { ok: true; companyName: string }
  | { ok: false; reason: "FEATURE_LOCKED" }

/**
 * Resolve the company-name string to render on customer-facing PDFs.
 *
 * Returns a discriminated result rather than throwing
 * FeatureLockedError because Next.js server actions strip custom
 * error properties at the serialization boundary — `result.ok ===
 * false` is the only reliable way to detect the Pro-tier gate on
 * the client. Auth + active-sub failures still throw (programmer-
 * error / 401-class), which the client handles via try/catch.
 *
 * Standard tier → `{ ok: false, reason: "FEATURE_LOCKED" }`. The
 * caller falls back to `DEFAULT_PDF_COMPANY_NAME`:
 *
 *   const branding = await getBrandedPdfCompanyName()
 *   const companyName = branding.ok ? branding.companyName : DEFAULT_PDF_COMPANY_NAME
 *
 * Pro+ tier with no `org.name` → `{ ok: true, companyName: DEFAULT_PDF_COMPANY_NAME }`
 * (defensive — shouldn't happen for an active sub, since the
 * onboarding flow requires it).
 */
export async function getBrandedPdfCompanyName(): Promise<BrandedPdfCompanyNameResult> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  const gate = await requireActiveSubscription(actor)
  try {
    await requireFeature(actor, "branded_pdfs")
  } catch (err) {
    if (err instanceof FeatureLockedError) {
      return { ok: false, reason: "FEATURE_LOCKED" }
    }
    throw err
  }

  if (!gate.organizationId) {
    return { ok: true, companyName: DEFAULT_PDF_COMPANY_NAME }
  }

  const org = await organizationService.getOrganizationById(gate.organizationId)
  return { ok: true, companyName: org?.name?.trim() || DEFAULT_PDF_COMPANY_NAME }
}
