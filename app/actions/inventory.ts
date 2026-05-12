"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { ensureDatabaseFactoryRegistered } from "@/app/server/database/register-factory"
import { requireAuthenticatedUser } from "@/app/server/auth/require-authenticated-user"
import { requirePermission } from "@/app/server/auth/require-permission"
import { legacyRollService as rollService } from "@/src/infrastructure/services/legacyRollService"
import type { Roll } from "@/src/infrastructure/models/supabase"

/**
 * Inventory actions.
 *
 * The sidebar quick-create dialog called `rollService.addRoll(...)`
 * directly from the browser. The page itself (`/dashboard/inventory`)
 * is `manageRolls`-gated by `proxy.ts`, but the dialog component is
 * mounted from the global sidebar — i.e., available on EVERY route.
 * A user lacking `manageRolls` permission could still open the dialog
 * (or call the service directly via devtools) and create rolls. ASVS
 * V4.2.1: every operation needs server-side authorization, not just
 * the route entry point.
 *
 * The action validates input with Zod, narrows the field surface to
 * the dialog's actual input set (no smuggling status / part_number /
 * is_offcut overrides), computes the derived fields server-side
 * (`status`, `remaining_length`), and threads `actor.id` into the
 * repository so RLS sees the right `auth.uid()`.
 *
 * `date_received` is the one derived field where the client gets a
 * say. The pre-action browser code built the date from local-time
 * getters (`getFullYear/getMonth/getDate`); a naive `toISOString()`
 * port silently regressed to UTC and wrote tomorrow's date for users
 * in negative-UTC offsets near local midnight (sigilix follow-up on
 * PR #177). The form now computes the user's local YYYY-MM-DD and
 * passes it through; the action validates the format and falls back
 * to UTC for non-form callers (keeps the contract robust to any
 * future caller that doesn't supply one).
 */

const INVENTORY_PATH = "/dashboard/inventory"

const positiveNumber = z.number({ message: "Must be a number" }).positive("Must be greater than 0")
const nonNegativeNumber = z.number().min(0, "Must be 0 or greater")

// Reject malformed strings AND impossible calendar dates like
// `2026-02-31` or `2026-13-01`. The regex catches shape, the refine
// catches semantic correctness — round-tripping through Date and
// comparing the canonical YYYY-MM-DD slice rejects month/day overflow
// (which `new Date("2026-02-31")` silently rolls forward to March).
// (coderabbit follow-up on PR #197.)
function isValidCalendarDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
const dateString = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
  .refine(isValidCalendarDate, "Invalid date")

const addRollSchema = z.object({
  material_type: z.string().trim().min(1, "Material type is required").max(100),
  width: positiveNumber,
  length: positiveNumber,
  thickness: positiveNumber,
  color: z.string().trim().max(100).optional(),
  location: z.string().trim().max(200).optional(),
  supplier: z.string().trim().max(200).optional(),
  cost_per_sqft: nonNegativeNumber.optional(),
  notes: z.string().trim().max(2000).optional(),
  // Optional: if present, must be `YYYY-MM-DD`. Form supplies the
  // user's local-calendar date; absent means the action falls back
  // to server-side UTC.
  date_received: dateString.optional(),
})

export type AddRollActionInput = z.input<typeof addRollSchema>

export async function addRoll(input: AddRollActionInput): Promise<Roll> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  requirePermission(actor, "manageRolls")
  const parsed = addRollSchema.parse(input)

  const today = parsed.date_received ?? new Date().toISOString().slice(0, 10)

  const result = await rollService.addRoll(
    {
      material_type: parsed.material_type,
      width: parsed.width,
      length: parsed.length,
      thickness: parsed.thickness,
      color: parsed.color,
      location: parsed.location,
      supplier: parsed.supplier,
      cost_per_sqft: parsed.cost_per_sqft,
      notes: parsed.notes,
      remaining_length: parsed.length,
      status: "active",
      date_received: today,
    },
    actor.id
  )

  revalidatePath(INVENTORY_PATH)
  return result
}
