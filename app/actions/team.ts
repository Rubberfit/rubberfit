"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { resolveUseCase } from "@/di/resolve"
import { TOKENS } from "@/di/tokens"
import type { IAcceptInvitationUseCase } from "@/src/application/use-cases/invitations/accept-invitation.use-case"
import type { ICreateInvitationUseCase } from "@/src/application/use-cases/invitations/create-invitation.use-case"
import type { IDeactivateMemberUseCase } from "@/src/application/use-cases/team/deactivate-member.use-case"
import type { IResendInvitationUseCase } from "@/src/application/use-cases/invitations/resend-invitation.use-case"
import type { IRevokeInvitationUseCase } from "@/src/application/use-cases/invitations/revoke-invitation.use-case"
import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"

import { requireActiveSubscription } from "@/app/server/auth/require-active-subscription"
import { requireAuthenticatedUser } from "@/app/server/auth/require-authenticated-user"
import { ensureDatabaseFactoryRegistered } from "@/app/server/database/register-factory"

const TEAM_PAGE_PATH = "/dashboard/settings/team"

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
 * Origin-only base URL for invitation accept links. Honors
 * NEXT_PUBLIC_APP_URL when set; falls back to localhost so dev runs
 * out-of-the-box.
 */
function acceptUrlBase(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
}

/**
 * Recovery-exempt: a freshly-registered user who has been invited has no
 * active subscription of their own. The use-case validates the invited
 * org's subscription instead.
 */
export async function acceptInvitation(input: { token: string }): Promise<
  | { organizationId: string; membershipId: string }
  | { error: string }
> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  const parsed = AcceptInvitationSchema.parse(input)

  try {
    const useCase = resolveUseCase<IAcceptInvitationUseCase>(TOKENS.IAcceptInvitationUseCase)
    const result = await useCase.execute({ actor, token: parsed.token })
    revalidatePath("/dashboard")
    revalidatePath(TEAM_PAGE_PATH)
    return result.ok
      ? { organizationId: result.tenantId, membershipId: result.membershipId }
      : { error: result.error }
  } catch (err) {
    return { error: errorMessage(err) }
  }
}

export async function createInvitation(input: { email: string; role: "admin" | "member" }): Promise<
  { invitationId: string } | { error: string }
> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  await requireActiveSubscription(actor)
  const parsed = CreateInvitationSchema.parse(input)

  try {
    const client = await getDatabaseClient()
    const useCase = resolveUseCase<ICreateInvitationUseCase>(TOKENS.ICreateInvitationUseCase)
    const result = await useCase.execute({
      client,
      actor,
      email: parsed.email,
      roles: [parsed.role],
      acceptUrlBase: acceptUrlBase(),
    })
    revalidatePath(TEAM_PAGE_PATH)
    return result.ok ? { invitationId: result.invitation.id } : { error: result.error }
  } catch (err) {
    return { error: errorMessage(err) }
  }
}

export async function revokeInvitation(input: {
  invitationId: string
}): Promise<{ ok: true } | { error: string }> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  await requireActiveSubscription(actor)
  const parsed = InvitationIdSchema.parse(input)

  try {
    const useCase = resolveUseCase<IRevokeInvitationUseCase>(TOKENS.IRevokeInvitationUseCase)
    const result = await useCase.execute({ actor, invitationId: parsed.invitationId })
    revalidatePath(TEAM_PAGE_PATH)
    return result.ok ? { ok: true } : { error: result.error }
  } catch (err) {
    return { error: errorMessage(err) }
  }
}

export async function resendInvitation(input: {
  invitationId: string
}): Promise<{ ok: true } | { error: string }> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  await requireActiveSubscription(actor)
  const parsed = InvitationIdSchema.parse(input)

  try {
    const client = await getDatabaseClient()
    const useCase = resolveUseCase<IResendInvitationUseCase>(TOKENS.IResendInvitationUseCase)
    const result = await useCase.execute({
      client,
      actor,
      invitationId: parsed.invitationId,
      acceptUrlBase: acceptUrlBase(),
    })
    revalidatePath(TEAM_PAGE_PATH)
    return result.ok ? { ok: true } : { error: result.error }
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
    revalidatePath(TEAM_PAGE_PATH)
    return result
  } catch (err) {
    return { error: errorMessage(err) }
  }
}
