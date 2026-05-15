"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import {
  SUPPORTED_CURRENCIES,
  SUPPORTED_DATE_FORMATS,
  SUPPORTED_LOCALES,
  SUPPORTED_TIME_ZONES,
  SUPPORTED_UNIT_SYSTEMS,
} from "@/src/application/preferences/constants"
import type { UserPreferences } from "@/src/infrastructure/models/user-preferences"
import { userPreferencesService } from "@/src/infrastructure/services/userPreferencesService"

import { requireAuthenticatedUser } from "@/app/server/auth/require-authenticated-user"
import { ensureDatabaseFactoryRegistered } from "@/app/server/database/register-factory"

const GENERAL_SETTINGS_PATH = "/dashboard/settings/general"

// All enum allow-lists come from the shared constants module so the
// Zod schema, the UI type guards, and the DB CHECK constraints can't
// drift independently.
const UpdatePreferencesSchema = z.object({
  defaultCurrency: z.enum(SUPPORTED_CURRENCIES).optional(),
  timeZone: z.enum(SUPPORTED_TIME_ZONES).optional(),
  dateFormat: z.enum(SUPPORTED_DATE_FORMATS).optional(),
  unitSystem: z.enum(SUPPORTED_UNIT_SYSTEMS).optional(),
  lowStockThresholdSqft: z.number().finite().nonnegative().max(1_000_000).optional(),
  locale: z.enum(SUPPORTED_LOCALES).optional(),
})

export type GetUserPreferencesResult = { data: UserPreferences } | { error: "not_provisioned" }

export type UpdateUserPreferencesResult =
  | { data: UserPreferences }
  | { error: "invalid"; message?: string }

/**
 * Reads the calling user's own preferences. No admin gate — every
 * authenticated user has their own row (auto-provisioned via the
 * profiles INSERT trigger).
 *
 * Recovery-exempt for the same reason as the org-prefs action: users
 * with a lapsed subscription should still be able to view + edit
 * their saved locale.
 */
export async function getUserPreferences(): Promise<GetUserPreferencesResult> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  try {
    const data = await userPreferencesService.getForUser(actor.id)
    return { data }
  } catch (err) {
    // The trigger should have auto-provisioned the row; surface a
    // typed envelope rather than letting the page error boundary fire.
    if (err instanceof Error && /No user_preferences row/.test(err.message)) {
      return { error: "not_provisioned" }
    }
    throw err
  }
}

/**
 * Updates the calling user's own preferences. RLS at the DB enforces
 * "you can only touch your own row" — the action passes actor.id
 * directly so a malicious wire-protocol caller can't target another
 * user's row even if they spoof the input.
 */
export async function updateUserPreferences(
  input: z.input<typeof UpdatePreferencesSchema>
): Promise<UpdateUserPreferencesResult> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()

  const parsed = UpdatePreferencesSchema.safeParse(input)
  if (!parsed.success) {
    return { error: "invalid", message: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  const data = await userPreferencesService.updateForUser(actor.id, parsed.data)
  revalidatePath(GENERAL_SETTINGS_PATH)
  return { data }
}
