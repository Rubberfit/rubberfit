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

  const organization = await organizationService.getCurrentOrganizationForUser(actor.id)
  if (!organization) {
    redirect("/checkout")
  }

  const [members, pendingInvites, seatUsage, subscription, role] = await Promise.all([
    organizationService.listMembers(organization.id),
    organizationService.listPendingInvitations(organization.id),
    organizationService.getSeatUsage(organization.id),
    organizationService.getCurrentSubscription(organization.id),
    organizationService.getMemberRole(organization.id, actor.id),
  ])

  const pricing = getPlanPricing(
    subscription?.plan_tier ?? "pro",
    subscription?.billing_interval ?? null
  )

  return (
    <TeamClient
      currentUserId={actor.id}
      currentUserRole={role ?? "member"}
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
