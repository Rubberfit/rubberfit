"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { resolveUseCase } from "@/di/resolve"
import { TOKENS } from "@/di/tokens"
import { ALL_ROLES } from "@/src/application/permissions"
import type {
  AcceptInvitationResult,
  IAcceptInvitationUseCase,
} from "@/src/application/use-cases/invitations/accept-invitation.use-case"
import type {
  CreateInvitationResult,
  ICreateInvitationUseCase,
} from "@/src/application/use-cases/invitations/create-invitation.use-case"
import type {
  IResendInvitationUseCase,
  ResendInvitationResult,
} from "@/src/application/use-cases/invitations/resend-invitation.use-case"
import type {
  IRevokeInvitationUseCase,
  RevokeInvitationResult,
} from "@/src/application/use-cases/invitations/revoke-invitation.use-case"
import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"

import {
  ACTIVE_TENANT_COOKIE,
  buildActiveTenantCookieOptions,
} from "@/app/server/auth/active-tenant"
import { requireAuthenticatedUser } from "@/app/server/auth/require-authenticated-user"
import { requirePermission } from "@/app/server/auth/require-permission"
import { ensureDatabaseFactoryRegistered } from "@/app/server/database/register-factory"

const MEMBERS_PAGE_PATH = "/dashboard/admin/members"

const APP_ROLE_VALUES = ALL_ROLES as readonly [
  (typeof ALL_ROLES)[number],
  ...(typeof ALL_ROLES)[number][],
]

const inviteMemberSchema = z.object({
  email: z.string().min(1).max(320),
  // .min(1) gives an `AppRole[]` inferred type — `.nonempty()` would
  // narrow to a tuple `[AppRole, ...AppRole[]]` which leaks into client
  // call sites. The use case re-checks length and rejects with a
  // friendly error if zero somehow slips through.
  roles: z.array(z.enum(APP_ROLE_VALUES)).min(1),
})

const invitationIdSchema = z.object({
  id: z.string().uuid(),
})

export type InviteMemberActionInput = z.input<typeof inviteMemberSchema>
export type InvitationIdActionInput = z.input<typeof invitationIdSchema>

/**
 * Resolve the public origin for the invitation accept URL. Honors
 * NEXT_PUBLIC_APP_URL when set; falls back to localhost so dev runs
 * out-of-the-box. Never empty — the use case builds
 * `${origin}/invite/${token}`.
 */
function acceptUrlBase(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
}

/**
 * Admin invites a new member by email. Creates the invitation row,
 * dispatches the email synchronously, and records the send outcome on
 * the row. Email failure does not block the row insert — the admin
 * sees the error in the pending-invitations table and can resend.
 */
export async function inviteMember(
  input: InviteMemberActionInput
): Promise<CreateInvitationResult> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  requirePermission(actor, "manageMembers")
  const parsed = inviteMemberSchema.parse(input)

  const client = await getDatabaseClient()
  const useCase = resolveUseCase<ICreateInvitationUseCase>(
    TOKENS.ICreateInvitationUseCase
  )

  const result = await useCase.execute({
    client,
    actor,
    email: parsed.email,
    roles: parsed.roles,
    acceptUrlBase: acceptUrlBase(),
  })

  if (result.ok) revalidatePath(MEMBERS_PAGE_PATH)
  return result
}

/**
 * Admin re-dispatches the invitation email for a still-active row.
 */
export async function resendInvitation(
  input: InvitationIdActionInput
): Promise<ResendInvitationResult> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  requirePermission(actor, "manageMembers")
  const parsed = invitationIdSchema.parse(input)

  const client = await getDatabaseClient()
  const useCase = resolveUseCase<IResendInvitationUseCase>(
    TOKENS.IResendInvitationUseCase
  )

  const result = await useCase.execute({
    client,
    actor,
    invitationId: parsed.id,
    acceptUrlBase: acceptUrlBase(),
  })

  if (result.ok) revalidatePath(MEMBERS_PAGE_PATH)
  return result
}

/**
 * Token-bearer accepts an invitation. No `manageMembers` gate here —
 * the token itself is the authorization (you can only know it if the
 * inviter shared it with you, and the RPC enforces email match against
 * the signed-in user). On success, sets the `rema_active_tenant`
 * cookie to the newly-joined tenant and busts the root layout so RSC
 * surfaces refetch with the new membership.
 */
const acceptInvitationSchema = z.object({
  token: z.string().min(1),
})

export type AcceptInvitationActionInput = z.input<typeof acceptInvitationSchema>

export async function acceptInvitation(
  input: AcceptInvitationActionInput
): Promise<AcceptInvitationResult> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  const parsed = acceptInvitationSchema.parse(input)

  const useCase = resolveUseCase<IAcceptInvitationUseCase>(
    TOKENS.IAcceptInvitationUseCase
  )
  const result = await useCase.execute({ actor, token: parsed.token })

  if (result.ok) {
    const cookieStore = await cookies()
    cookieStore.set(
      ACTIVE_TENANT_COOKIE,
      result.tenantId,
      buildActiveTenantCookieOptions()
    )
    revalidatePath("/", "layout")
  }
  return result
}

/**
 * Admin cancels a pending invitation.
 */
export async function revokeInvitation(
  input: InvitationIdActionInput
): Promise<RevokeInvitationResult> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  requirePermission(actor, "manageMembers")
  const parsed = invitationIdSchema.parse(input)

  const useCase = resolveUseCase<IRevokeInvitationUseCase>(
    TOKENS.IRevokeInvitationUseCase
  )

  const result = await useCase.execute({
    actor,
    invitationId: parsed.id,
  })

  if (result.ok) revalidatePath(MEMBERS_PAGE_PATH)
  return result
}
