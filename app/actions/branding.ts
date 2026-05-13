"use server"

import { DEFAULT_PDF_COMPANY_NAME } from "@/src/application/billing/pdf-branding"
import { organizationService } from "@/src/infrastructure/services/organizationService"

import { requireActiveSubscription } from "@/app/server/auth/require-active-subscription"
import { requireAuthenticatedUser } from "@/app/server/auth/require-authenticated-user"
import { requireFeature } from "@/app/server/auth/require-feature"
import { ensureDatabaseFactoryRegistered } from "@/app/server/database/register-factory"

/**
 * Resolve the company-name string to render on customer-facing PDFs
 * (job sheets, purchase orders, analytics reports). Pro+ tier gate —
 * throws `FeatureLockedError` for Standard.
 *
 * The client-side pattern is a try/catch fallback: every PDF flow
 * always renders, but the branding silently downgrades to the
 * default for Standard customers. This keeps the gate enforceable
 * server-side without breaking the Standard PDF UX.
 *
 *   let companyName = DEFAULT_PDF_COMPANY_NAME
 *   try {
 *     companyName = await getBrandedPdfCompanyName()
 *   } catch (err) {
 *     // FeatureLockedError or no-sub — keep the default
 *   }
 *   const blob = buildJobPdfBlob(job, { companyName })
 *
 * Returns `DEFAULT_PDF_COMPANY_NAME` if the actor passes the gate
 * but their org has no `name` set (defensive — shouldn't happen for
 * an active sub, since the onboarding flow requires it).
 */
export async function getBrandedPdfCompanyName(): Promise<string> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  const gate = await requireActiveSubscription(actor)
  await requireFeature(actor, "branded_pdfs")

  if (!gate.organizationId) {
    return DEFAULT_PDF_COMPANY_NAME
  }

  const org = await organizationService.getOrganizationById(gate.organizationId)
  return org?.name?.trim() || DEFAULT_PDF_COMPANY_NAME
}
