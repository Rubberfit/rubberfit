"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { ALL_ROLES } from "@/src/application/permissions"
import { ensureDatabaseFactoryRegistered } from "@/app/server/database/register-factory"
import { requireAuthenticatedUser } from "@/app/server/auth/require-authenticated-user"
import { requirePermission } from "@/app/server/auth/require-permission"
import { userManagementService } from "@/src/infrastructure/services/userManagementService"
import type { UserProfile } from "@/src/infrastructure/models/supabase"

/**
 * User management actions. The pre-action call sites (`user-form-modal`
 * and `users/page.tsx`) lived behind the `useRole().isAdmin` UI gate
 * only — a non-admin with devtools could call
 * `userManagementService.updateUser(targetId, { roles: ["admin"] })`
 * and escalate themselves. ASVS V4.1 (server-side enforcement of
 * access controls) treats client-side gates as advisory; the action
 * boundary is what makes the check authoritative.
 *
 * Each action does, in order:
 *   1. `ensureDatabaseFactoryRegistered()` — Phase 0 RLS plumbing.
 *   2. `requireAuthenticatedUser()` — fail-closed auth.
 *   3. `requirePermission(actor, "manageUsers")` — admin-only token.
 *   4. Zod-validate the input. We do NOT trust the client form's
 *      schema; an action receives whatever a client serializes, and
 *      a malicious client can serialize anything.
 *   5. Narrow the field surface. The legacy
 *      `userManagementService.updateUser` accepts `UpdateUserProfile`,
 *      which includes `is_deleted`. The action's `updateUser` deliberately
 *      forwards only `{ full_name, email, roles }` so the only way to
 *      flip `is_deleted` is via the explicit `deactivateUser` /
 *      `reactivateUser` actions. This makes the audit trail (post
 *      ARC-31) reflect intent: a user role-edit and a user deactivation
 *      are different operations.
 */

const USERS_PATH = "/dashboard/users"

const userIdSchema = z.string().uuid({ message: "Invalid user id" })
const roleSchema = z.enum(ALL_ROLES)

// Email max-length per RFC 5321 (254 chars). Name capped at 200 to
// match common DB column widths and prevent absurd payloads.
const updateUserSchema = z.object({
  userId: userIdSchema,
  full_name: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().email("Enter a valid email").max(254),
  roles: z.array(roleSchema).min(1, "At least one role is required"),
})

const userIdInputSchema = z.object({ userId: userIdSchema })

export type UpdateUserActionInput = z.input<typeof updateUserSchema>
export type DeactivateUserActionInput = z.input<typeof userIdInputSchema>
export type ReactivateUserActionInput = z.input<typeof userIdInputSchema>

export async function updateUser(input: UpdateUserActionInput): Promise<UserProfile> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  requirePermission(actor, "manageUsers")
  const parsed = updateUserSchema.parse(input)

  const result = await userManagementService.updateUser(parsed.userId, {
    full_name: parsed.full_name,
    email: parsed.email,
    roles: parsed.roles,
  })
  revalidatePath(USERS_PATH)
  return result
}

export async function deactivateUser(input: DeactivateUserActionInput): Promise<UserProfile> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  requirePermission(actor, "manageUsers")
  const parsed = userIdInputSchema.parse(input)

  // Defense-in-depth: an admin deactivating themselves is a footgun
  // (immediate self-lockout — they can't undo it on the next request
  // because their own auth check now fails). The UI guards this
  // separately; this is the server-side belt to the UI's suspenders.
  if (parsed.userId === actor.id) {
    throw new Error("Cannot deactivate your own account")
  }

  const result = await userManagementService.deactivateUser(parsed.userId)
  revalidatePath(USERS_PATH)
  return result
}

export async function reactivateUser(input: ReactivateUserActionInput): Promise<UserProfile> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  requirePermission(actor, "manageUsers")
  const parsed = userIdInputSchema.parse(input)

  const result = await userManagementService.reactivateUser(parsed.userId)
  revalidatePath(USERS_PATH)
  return result
}
