"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { resolveUseCase } from "@/di/resolve"
import { TOKENS } from "@/di/tokens"
import type { IOrganizationService } from "@/src/application/services/organization.service.interface"
import type { ICreateCheckoutSessionUseCase } from "@/src/application/use-cases/billing/create-checkout-session.use-case"
import type { ICreateOrganizationFromOnboardingUseCase } from "@/src/application/use-cases/billing/create-organization-from-onboarding.use-case"
import type { IUpdateSubscriptionSeatCountUseCase } from "@/src/application/use-cases/billing/update-subscription-seat-count.use-case"

import { requireActiveSubscription } from "@/app/server/auth/require-active-subscription"
import { requireAuthenticatedUser } from "@/app/server/auth/require-authenticated-user"
import { ensureDatabaseFactoryRegistered } from "@/app/server/database/register-factory"

const checkoutPlanTierSchema = z.enum(["standard", "pro", "max"])
const billingIntervalSchema = z.enum(["monthly", "annual"])

const CreateOrganizationFromOnboardingSchema = z.object({
  companyName: z.string().trim().min(1).max(200),
  seatCount: z.number().int().min(1).max(500),
  planTier: checkoutPlanTierSchema,
})

const CreateCheckoutSessionSchema = z.object({
  organizationId: z.string().uuid(),
  billingInterval: billingIntervalSchema,
})

const UpdateSubscriptionSeatCountSchema = z.object({
  newSeatCount: z.number().int().min(1).max(500),
})

const SelectSubscriptionPlanTierSchema = z.object({
  organizationId: z.string().uuid(),
  planTier: checkoutPlanTierSchema,
  seatCount: z.number().int().min(1).max(500),
})

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Billing action failed"
}

function invalidInputError(): { error: string } {
  return { error: "Invalid input" }
}

export async function createOrganizationFromOnboarding(input: {
  companyName: string
  seatCount: number
  planTier: "standard" | "pro" | "max"
}): Promise<{ organizationId: string } | { error: string }> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  const parsedResult = CreateOrganizationFromOnboardingSchema.safeParse(input)
  if (!parsedResult.success) return invalidInputError()
  const parsed = parsedResult.data

  try {
    const useCase = resolveUseCase<ICreateOrganizationFromOnboardingUseCase>(
      TOKENS.ICreateOrganizationFromOnboardingUseCase
    )
    const result = await useCase.execute({ ...parsed, actor })
    revalidatePath("/checkout")
    return result
  } catch (err) {
    return { error: errorMessage(err) }
  }
}

export async function selectSubscriptionPlanTier(input: {
  organizationId: string
  planTier: "standard" | "pro" | "max"
  seatCount: number
}): Promise<{ ok: true } | { error: string }> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  const parsedResult = SelectSubscriptionPlanTierSchema.safeParse(input)
  if (!parsedResult.success) return invalidInputError()
  const parsed = parsedResult.data

  // Membership guard — only owners/admins of the org may change the
  // pre-checkout tier. Mirrors createCheckoutSession's action-layer check.
  const organizationService = resolveUseCase<IOrganizationService>(TOKENS.IOrganizationService)
  const role = await organizationService.getMemberRole(parsed.organizationId, actor.id)
  if (role !== "owner" && role !== "admin") {
    return { error: "forbidden" }
  }

  try {
    const subscription = await organizationService.getCurrentSubscription(parsed.organizationId)
    if (!subscription) {
      return { error: "subscription_not_found" }
    }
    // Tier selection is a pre-checkout-only operation. Once Stripe Checkout
    // succeeds, plan changes go through the Billing Portal, not this flow.
    if (subscription.status !== "incomplete" && subscription.status !== "incomplete_expired") {
      return { error: "subscription_already_active" }
    }

    await organizationService.upsertSubscription({
      organization_id: parsed.organizationId,
      plan_tier: parsed.planTier,
      seat_count: parsed.seatCount,
      status: subscription.status,
      is_current: true,
    })
    revalidatePath("/checkout")
    return { ok: true }
  } catch (err) {
    return { error: errorMessage(err) }
  }
}

export async function createCheckoutSession(input: {
  organizationId: string
  billingInterval: "monthly" | "annual"
}): Promise<{ url: string } | { error: string }> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  const parsedResult = CreateCheckoutSessionSchema.safeParse(input)
  if (!parsedResult.success) return invalidInputError()
  const parsed = parsedResult.data

  // Action-layer membership guard. The use-case re-validates, but bouncing
  // unauthorized callers here returns a clean `{ error: "forbidden" }`
  // instead of leaking the use-case's internal error string.
  const organizationService = resolveUseCase<IOrganizationService>(TOKENS.IOrganizationService)
  const role = await organizationService.getMemberRole(parsed.organizationId, actor.id)
  if (role !== "owner" && role !== "admin") {
    return { error: "forbidden" }
  }

  try {
    const useCase = resolveUseCase<ICreateCheckoutSessionUseCase>(
      TOKENS.ICreateCheckoutSessionUseCase
    )
    return await useCase.execute({ ...parsed, actor })
  } catch (err) {
    return { error: errorMessage(err) }
  }
}

export async function createBillingPortalSession(): Promise<{ url: string } | { error: string }> {
  ensureDatabaseFactoryRegistered()
  await requireAuthenticatedUser()
  // PR 5 ships the lock-screen UI that calls this; the Stripe Billing Portal
  // session creation lands in a follow-up PR alongside the cancel/resume flow.
  // Until then, return a user-facing message — the lock screen surfaces
  // this string directly to the operator on `intent=update_billing`.
  return {
    error:
      "Billing portal isn't available yet. Please email support@rubberfit.app to update your card.",
  }
}

export async function leaveOrganization(): Promise<{ ok: true } | { error: string }> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()

  try {
    const organizationService = resolveUseCase<IOrganizationService>(TOKENS.IOrganizationService)
    await organizationService.deactivateOwnMembership(actor.id)
    revalidatePath("/checkout")
    return { ok: true }
  } catch (err) {
    return { error: errorMessage(err) }
  }
}

export async function updateSubscriptionSeatCount(input: { newSeatCount: number }): Promise<
  | { ok: true; newSeatCount: number }
  | {
      error:
        | "forbidden"
        | "seat_count_out_of_range"
        | "subscription_not_found"
        | "subscription_inactive"
        | "stripe_subscription_missing"
        | "stripe_subscription_item_missing"
        | "cannot_downsize_below_used"
        | "stripe_update_failed"
      used?: number
    }
  | { error: string }
> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  const gate = await requireActiveSubscription(actor)
  const parsedResult = UpdateSubscriptionSeatCountSchema.safeParse(input)
  if (!parsedResult.success) return invalidInputError()
  const parsed = parsedResult.data

  try {
    const useCase = resolveUseCase<IUpdateSubscriptionSeatCountUseCase>(
      TOKENS.IUpdateSubscriptionSeatCountUseCase
    )
    const result = await useCase.execute({
      organizationId: gate.organizationId,
      newSeatCount: parsed.newSeatCount,
      actor,
    })
    revalidatePath("/dashboard/settings/team")
    revalidatePath("/checkout")
    return result
  } catch (err) {
    return { error: errorMessage(err) }
  }
}
