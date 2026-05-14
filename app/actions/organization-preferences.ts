"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import type { OrganizationPreferences } from "@/src/infrastructure/models/organization-preferences"
import { organizationPreferencesService } from "@/src/infrastructure/services/organizationPreferencesService"
import { organizationService } from "@/src/infrastructure/services/organizationService"

import { requireAuthenticatedUser } from "@/app/server/auth/require-authenticated-user"
import { ensureDatabaseFactoryRegistered } from "@/app/server/database/register-factory"

const GENERAL_SETTINGS_PATH = "/dashboard/settings/general"

// Mirrors the time_zone CHECK constraint in migration
// 20260514000001_create_organization_preferences.sql so the action's
// typed `{ error: "invalid" }` envelope catches the case *before* the
// service hits the DB. Extend both sides together when adding a zone.
const ALLOWED_TIME_ZONES = [
  "America/Chicago",
  "America/New_York",
  "America/Los_Angeles",
  "America/Denver",
  "America/Phoenix",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
] as const

const UpdatePreferencesSchema = z.object({
  defaultCurrency: z.enum(["USD", "EUR", "GBP", "CAD"]).optional(),
  timeZone: z.enum(ALLOWED_TIME_ZONES).optional(),
  dateFormat: z.enum(["MM/dd/yyyy", "dd/MM/yyyy", "yyyy-MM-dd"]).optional(),
  unitSystem: z.enum(["imperial", "metric"]).optional(),
  lowStockThresholdSqft: z.number().finite().nonnegative().max(1_000_000).optional(),
  locale: z.enum(["en-US", "es-MX"]).optional(),
})

export type GetPreferencesResult =
  | { data: OrganizationPreferences; isAdmin: boolean }
  | { error: "no_organization" }

export type UpdatePreferencesResult =
  | { data: OrganizationPreferences }
  | { error: "no_organization" | "forbidden" | "invalid"; message?: string }

/**
 * Reads the calling user's current org preferences plus whether the
 * caller is an org admin (so the UI can render the admin lane vs the
 * read-only / personal-override lane).
 *
 * Intentionally NOT gated on `requireActiveSubscription` — a workspace
 * whose billing has lapsed should still be able to read its own
 * preferences (and locale, in particular) so the customer can see
 * what's saved while they recover the subscription.
 */
export async function getOrganizationPreferences(): Promise<GetPreferencesResult> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  const org = await organizationService.getCurrentOrganizationForUser(actor.id)
  if (!org) {
    return { error: "no_organization" }
  }

  const role = await organizationService.getMemberRole(org.id, actor.id)
  const isAdmin = role === "owner" || role === "admin"

  const data = await organizationPreferencesService.getForOrganization(org.id)
  return { data, isAdmin }
}

/**
 * Admin-only update of the workspace-default org preferences. Non-admins
 * are short-circuited with `forbidden` before the DB call to avoid the
 * less-helpful "RLS returned no row" surface. Zod parse failures return
 * `invalid` with a message; downstream errors propagate as throws so
 * the action's typed error envelope only carries the cases the UI
 * actually branches on.
 */
export async function updateOrganizationPreferences(
  input: z.input<typeof UpdatePreferencesSchema>
): Promise<UpdatePreferencesResult> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  const org = await organizationService.getCurrentOrganizationForUser(actor.id)
  if (!org) {
    return { error: "no_organization" }
  }

  const role = await organizationService.getMemberRole(org.id, actor.id)
  const isAdmin = role === "owner" || role === "admin"
  if (!isAdmin) {
    return { error: "forbidden" }
  }

  const parsed = UpdatePreferencesSchema.safeParse(input)
  if (!parsed.success) {
    return { error: "invalid", message: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  const data = await organizationPreferencesService.updateForOrganization(
    org.id,
    parsed.data
  )
  revalidatePath(GENERAL_SETTINGS_PATH)
  return { data }
}
