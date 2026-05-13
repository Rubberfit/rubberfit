"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { resolveUseCase } from "@/di/resolve"
import { TOKENS } from "@/di/tokens"
import type { IAcceptInvitationUseCase } from "@/src/application/use-cases/team/accept-invitation.use-case"
import type { ICreateInvitationUseCase } from "@/src/application/use-cases/team/create-invitation.use-case"
import type { IDeactivateMemberUseCase } from "@/src/application/use-cases/team/deactivate-member.use-case"
import type { IResendInvitationUseCase } from "@/src/application/use-cases/team/resend-invitation.use-case"
import type { IRevokeInvitationUseCase } from "@/src/application/use-cases/team/revoke-invitation.use-case"

import { requireActiveSubscription } from "@/app/server/auth/require-active-subscription"
import { requireAuthenticatedUser } from "@/app/server/auth/require-authenticated-user"
import { ensureDatabaseFactoryRegistered } from "@/app/server/database/register-factory"

const AcceptInvitationSchema = z.object({
  token: z.string().trim().min(1).max(512),
})

const CreateInvitationSchema = z.object({
  email: z.string().trim().min(3).max(255).email(),
  role: z.enum(["admin", "member"]),
})

const InvitationIdSchema = z.object({
  invitationId: z.string().uuid(),
})

const DeactivateMemberSchema = z.object({
  memberId: z.string().uuid(),
})

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Team action failed"
}

/**
 * Recovery-exempt: a freshly-registered user who has been invited has no
 * active subscription of their own. The use-case validates the invited
 * org's subscription instead.
 */
export async function acceptInvitation(input: { token: string }): Promise<
  | { organizationId: string; membershipId: string }
  | {
      error:
        | "not_found"
        | "expired"
        | "already_accepted"
        | "revoked"
        | "email_mismatch"
        | "org_subscription_inactive"
        | "membership_exists"
        | "accept_failed"
    }
> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  const parsed = AcceptInvitationSchema.parse(input)

  try {
    const useCase = resolveUseCase<IAcceptInvitationUseCase>(TOKENS.IAcceptInvitationUseCase)
    const result = await useCase.execute({ token: parsed.token, actor })
    revalidatePath("/dashboard")
    revalidatePath("/dashboard/settings/team")
    return result
  } catch {
    return { error: "accept_failed" }
  }
}

export async function createInvitation(input: { email: string; role: "admin" | "member" }): Promise<
  | { invitationId: string }
  | {
      error:
        | "forbidden"
        | "invalid_email"
        | "email_too_long"
        | "duplicate_pending_invite"
        | "already_member"
        | "seat_cap_reached"
        | "role_not_allowed"
        | "invite_email_failed"
    }
  | { error: string }
> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  const gate = await requireActiveSubscription(actor)
  const parsed = CreateInvitationSchema.parse(input)

  try {
    const useCase = resolveUseCase<ICreateInvitationUseCase>(TOKENS.ICreateInvitationUseCase)
    const result = await useCase.execute({
      organizationId: gate.organizationId,
      email: parsed.email,
      role: parsed.role,
      actor,
    })
    revalidatePath("/dashboard/settings/team")
    return result
  } catch (err) {
    return { error: errorMessage(err) }
  }
}

export async function revokeInvitation(input: {
  invitationId: string
}): Promise<
  { ok: true } | { error: "not_found" | "not_pending" | "forbidden" } | { error: string }
> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  await requireActiveSubscription(actor)
  const parsed = InvitationIdSchema.parse(input)

  try {
    const useCase = resolveUseCase<IRevokeInvitationUseCase>(TOKENS.IRevokeInvitationUseCase)
    const result = await useCase.execute({ invitationId: parsed.invitationId, actor })
    revalidatePath("/dashboard/settings/team")
    return result
  } catch (err) {
    return { error: errorMessage(err) }
  }
}

export async function resendInvitation(input: {
  invitationId: string
}): Promise<
  | { ok: true }
  | { error: "not_found" | "not_pending" | "forbidden" | "invite_email_failed" }
  | { error: string }
> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  await requireActiveSubscription(actor)
  const parsed = InvitationIdSchema.parse(input)

  try {
    const useCase = resolveUseCase<IResendInvitationUseCase>(TOKENS.IResendInvitationUseCase)
    const result = await useCase.execute({ invitationId: parsed.invitationId, actor })
    revalidatePath("/dashboard/settings/team")
    return result
  } catch (err) {
    return { error: errorMessage(err) }
  }
}

export async function deactivateMember(input: { memberId: string }): Promise<
  | { ok: true }
  | {
      error:
        | "member_not_found"
        | "forbidden"
        | "cannot_deactivate_owner"
        | "cannot_deactivate_self"
        | "not_active"
    }
  | { error: string }
> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  const gate = await requireActiveSubscription(actor)
  const parsed = DeactivateMemberSchema.parse(input)

  try {
    const useCase = resolveUseCase<IDeactivateMemberUseCase>(TOKENS.IDeactivateMemberUseCase)
    const result = await useCase.execute({
      organizationId: gate.organizationId,
      memberId: parsed.memberId,
      actor,
    })
    revalidatePath("/dashboard/settings/team")
    return result
  } catch (err) {
    return { error: errorMessage(err) }
  }
}
