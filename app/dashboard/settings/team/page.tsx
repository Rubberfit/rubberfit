import { redirect } from "next/navigation"

import { resolveUseCase } from "@/di/resolve"
import { TOKENS } from "@/di/tokens"
import { getPlanPricing } from "@/src/application/use-cases/billing/billing-plan"
import type { IOrganizationService } from "@/src/application/services/organization.service.interface"

import { requireAuthenticatedUser } from "@/app/server/auth/require-authenticated-user"
import { ensureDatabaseFactoryRegistered } from "@/app/server/database/register-factory"

import { TeamClient } from "./_components/team-client"

/**
 * Settings → Team. Members + pending invites + seat usage live here.
 *
 * The page is gated by the proxy subscription gate, so reaching it implies
 * the actor has an active org subscription. A member-role caller still gets
 * here but the client component renders read-only.
 */
export default async function TeamSettingsPage() {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  const organizationService = resolveUseCase<IOrganizationService>(TOKENS.IOrganizationService)

  // Diagnostic wrapper: when the page errors on the preview DB the
  // founder hits a generic 500. Run each query in its own try and
  // log the failing step + message + Postgres error code so the next
  // reload tells us exactly which call broke instead of guessing.
  // Cheap noise — pruned once the root cause is fixed.
  const organization = await traceTeamPageStep(
    "getCurrentOrganizationForUser",
    () => organizationService.getCurrentOrganizationForUser(actor.id),
    { actorId: actor.id }
  )
  if (!organization) {
    redirect("/checkout")
  }

  // Resilient sub-fetches: pending-invitations + seat-usage can fail
  // on environments where RLS isn't fully provisioned for the actor
  // (preview DBs, grandfather Enterprise rows, etc.). Letting either
  // failure blank the whole team page is a worse UX than showing
  // members with an empty invite list / zeroed seat counts and a
  // diagnostic log line. Members + role still throw because without
  // them the page is fundamentally meaningless.
  const [members, pendingInvitesResult, seatUsageResult, subscription, role] = await Promise.all([
    softTeamPageStep(
      "listMembers",
      () => organizationService.listMembers(organization.id),
      [] as Awaited<ReturnType<IOrganizationService["listMembers"]>>,
      { organizationId: organization.id }
    ),
    softTeamPageStep(
      "listPendingInvitations",
      () => organizationService.listPendingInvitations(organization.id),
      [] as Awaited<ReturnType<IOrganizationService["listPendingInvitations"]>>,
      { organizationId: organization.id }
    ),
    softTeamPageStep(
      "getSeatUsage",
      () => organizationService.getSeatUsage(organization.id),
      {
        purchased: 0,
        active_members: 0,
        pending_invites: 0,
        used: 0,
        available: 0,
      } as Awaited<ReturnType<IOrganizationService["getSeatUsage"]>>,
      { organizationId: organization.id }
    ),
    traceTeamPageStep(
      "getCurrentSubscription",
      () => organizationService.getCurrentSubscription(organization.id),
      { organizationId: organization.id }
    ),
    traceTeamPageStep(
      "getMemberRole",
      () => organizationService.getMemberRole(organization.id, actor.id),
      { organizationId: organization.id, actorId: actor.id }
    ),
  ])

  const pendingInvites = pendingInvitesResult
  const seatUsage = seatUsageResult

  // A null role means the actor isn't a member of this org. The proxy gate
  // ordinarily blocks this path, but bounce to the dashboard root rather than
  // grant default member-level access if anything ever slips through.
  if (role === null) {
    redirect("/dashboard")
  }

  const pricing = getPlanPricing(
    subscription?.plan_tier ?? "pro",
    subscription?.billing_interval ?? null
  )

  return (
    <TeamClient
      currentUserId={actor.id}
      currentUserRole={role}
      members={members.map((m) => ({
        id: m.id,
        userId: m.user_id,
        fullName: m.profile?.full_name ?? null,
        email: m.profile?.email ?? null,
        avatarUrl: m.profile?.avatar_url ?? null,
        role: m.role,
        status: m.status,
        lastActiveAt: null,
      }))}
      pendingInvites={pendingInvites.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        sentAt: i.created_at,
      }))}
      seatUsage={{
        purchased: seatUsage.purchased,
        used: seatUsage.used,
        available: seatUsage.available,
      }}
      pricing={{
        planTier: subscription?.plan_tier ?? "pro",
        billingInterval: subscription?.billing_interval ?? "monthly",
        pricePerSeatPerMonth: pricing.pricePerSeatPerMonth,
        currency: pricing.currency,
      }}
    />
  )
}

/**
 * Wraps a single team-page data fetch with structured logging. The
 * preview deployment currently 500s somewhere in this flow and the
 * runtime log stream keeps timing out before we capture which step
 * threw — this helper makes the failing step + Postgres code
 * obvious in the next reload's logs. Prune once the root cause is
 * fixed.
 */
async function traceTeamPageStep<T>(
  step: string,
  fn: () => Promise<T>,
  context: Record<string, unknown>
): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    logTeamPageFailure(step, context, err)
    throw err
  }
}

/**
 * Like `traceTeamPageStep` but swallows the failure and returns a
 * fallback. Use for sub-fetches whose absence shouldn't blank the
 * whole page — pending invites + seat usage in particular fail
 * under RLS denials (42501) on preview / grandfather Enterprise
 * orgs, and the page is still useful without them.
 */
async function softTeamPageStep<T>(
  step: string,
  fn: () => Promise<T>,
  fallback: T,
  context: Record<string, unknown>
): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    logTeamPageFailure(step, context, err)
    return fallback
  }
}

function logTeamPageFailure(step: string, context: Record<string, unknown>, err: unknown): void {
  const pgError = err as { code?: string; message?: string; details?: string; hint?: string }
  // eslint-disable-next-line no-console
  console.error(
    `[settings/team] step "${step}" failed`,
    {
      step,
      ...context,
      pgCode: pgError?.code,
      message: pgError?.message,
      details: pgError?.details,
      hint: pgError?.hint,
    },
    err
  )
}
