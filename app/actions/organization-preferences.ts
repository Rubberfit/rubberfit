"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { resolveUseCase } from "@/di/resolve"
import { TOKENS } from "@/di/tokens"
import {
  SUPPORTED_CURRENCIES,
  SUPPORTED_DATE_FORMATS,
  SUPPORTED_LOCALES,
  SUPPORTED_TIME_ZONES,
  SUPPORTED_UNIT_SYSTEMS,
} from "@/src/application/preferences/constants"
import type { IOrganizationPreferencesService } from "@/src/application/services/organization-preferences.service.interface"
import type { IOrganizationService } from "@/src/application/services/organization.service.interface"
import type { OrganizationPreferences } from "@/src/infrastructure/models/organization-preferences"

import { requireActiveSubscription } from "@/app/server/auth/require-active-subscription"
import { requireAuthenticatedUser } from "@/app/server/auth/require-authenticated-user"
import { ensureDatabaseFactoryRegistered } from "@/app/server/database/register-factory"

const GENERAL_SETTINGS_PATH = "/dashboard/settings/general"

// All enum allow-lists come from the shared constants module so the
// Zod schema, the UI type guards, and the DB CHECK constraints can't
// drift independently.
const UpdateOrganizationPreferencesSchema = z.object({
  defaultCurrency: z.enum(SUPPORTED_CURRENCIES).optional(),
  timeZone: z.enum(SUPPORTED_TIME_ZONES).optional(),
  dateFormat: z.enum(SUPPORTED_DATE_FORMATS).optional(),
  unitSystem: z.enum(SUPPORTED_UNIT_SYSTEMS).optional(),
  lowStockThresholdSqft: z.number().finite().nonnegative().max(1_000_000).optional(),
  locale: z.enum(SUPPORTED_LOCALES).optional(),
})

export type GetOrganizationPreferencesResult =
  | { data: OrganizationPreferences }
  | { error: "not_provisioned" }
  | { error: "no_organization" }

export type UpdateOrganizationPreferencesResult =
  | { data: OrganizationPreferences }
  | { error: "invalid"; message?: string }
  | { error: "no_organization" }
  | { error: "forbidden" }

/**
 * Reads the active organization's preferences for the calling user.
 * Org prefs govern shared/printed surfaces (PDFs, billing dates,
 * shared dashboard chrome where applicable) per the 2026-05-14
 * operator-seeds-prints ruling.
 *
 * Recovery-exempt: NOT gated on `requireActiveSubscription` because
 * the dashboard layout and billing page both fetch this on render,
 * and a lapsed-subscription user needs to see the billing page in
 * the operator's date format so they can fix their billing.
 */
export async function getOrganizationPreferences(): Promise<GetOrganizationPreferencesResult> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  const organizationService = resolveUseCase<IOrganizationService>(TOKENS.IOrganizationService)
  const org = await organizationService.getCurrentOrganizationForUser(actor.id)
  if (!org) return { error: "no_organization" }

  const prefsService = resolveUseCase<IOrganizationPreferencesService>(
    TOKENS.IOrganizationPreferencesService
  )
  try {
    const data = await prefsService.getForOrganization(org.id)
    return { data }
  } catch (err) {
    // Recovery-exempt contract: the dashboard layout + billing page
    // depend on this read succeeding on every render. The provision
    // trigger should have inserted a row when the org was created;
    // surface a typed envelope for the known empty-row case AND for
    // any unexpected service failure so the layout can fall back to
    // defaults rather than tripping an error boundary that locks the
    // user out of the dashboard. The original error is logged for
    // observability; the action never bubbles it.
    if (err instanceof Error && /No organization_preferences row/.test(err.message)) {
      return { error: "not_provisioned" }
    }
    console.error("[organization-preferences] read failed; returning not_provisioned:", err)
    return { error: "not_provisioned" }
  }
}

/**
 * Updates the active organization's preferences. Owner/admin only —
 * RLS at the DB enforces the same rule (`organization_members.role`
 * IN ('owner','admin')); the action-level check is defense in depth
 * and lets us return a clean `{ error: "forbidden" }` envelope
 * instead of a generic RLS-rejection throw.
 *
 * Subscription-gated: unlike the read path, mutating shared workspace
 * defaults requires an active subscription. The settings page itself
 * is already subscription-gated by the proxy, but a lapsed admin
 * could hit the action directly; this gate keeps the behavior
 * consistent with every other shared-resource write in the codebase.
 */
export async function updateOrganizationPreferences(
  input: z.input<typeof UpdateOrganizationPreferencesSchema>
): Promise<UpdateOrganizationPreferencesResult> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  await requireActiveSubscription(actor)

  const parsed = UpdateOrganizationPreferencesSchema.safeParse(input)
  if (!parsed.success) {
    return { error: "invalid", message: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  const organizationService = resolveUseCase<IOrganizationService>(TOKENS.IOrganizationService)
  const org = await organizationService.getCurrentOrganizationForUser(actor.id)
  if (!org) return { error: "no_organization" }

  const role = await organizationService.getMemberRole(org.id, actor.id)
  if (role !== "owner" && role !== "admin") {
    return { error: "forbidden" }
  }

  const prefsService = resolveUseCase<IOrganizationPreferencesService>(
    TOKENS.IOrganizationPreferencesService
  )
  const data = await prefsService.updateForOrganization(org.id, parsed.data)
  revalidatePath(GENERAL_SETTINGS_PATH)
  return { data }
}
