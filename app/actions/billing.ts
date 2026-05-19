"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { resolveUseCase } from "@/di/resolve"
import { TOKENS } from "@/di/tokens"
import type { IOrganizationService } from "@/src/application/services/organization.service.interface"
import type {
  CreateBillingPortalSessionError,
  ICreateBillingPortalSessionUseCase,
} from "@/src/application/use-cases/billing/create-billing-portal-session.use-case"
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

const CreateBillingPortalSessionSchema = z.object({
  organizationId: z.string().uuid(),
  returnPath: z
    .string()
    .trim()
    .min(1)
    .max(2048)
    .refine(
      (value) =>
        value.startsWith("/") &&
        !value.startsWith("//") &&
        !value.includes("\\") &&
        !/^https?:\/\//i.test(value),
      "returnPath must be a same-origin path"
    )
    .optional(),
})

const PORTAL_ERROR_MESSAGES: Record<CreateBillingPortalSessionError, string> = {
  forbidden: "Only organization owners and admins can manage billing.",
  organization_not_found: "We couldn't find your organization. Please refresh and try again.",
  subscription_not_found: "No active subscription found for this organization.",
  checkout_required: "Finish checkout before managing billing.",
  restart_subscription: "Your subscription has ended — start a new one to manage billing.",
  enterprise_account: "Enterprise contracts are managed by your account manager.",
  stripe_customer_missing:
    "Your Stripe customer record is missing. Please email support@rubberfit.app.",
  stripe_portal_unavailable:
    "Stripe billing portal is temporarily unavailable. Please try again in a moment.",
  invalid_return_path: "Invalid return path.",
}

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

    // In-place patch so pre-set fields on the row (stripe_customer_id,
    // trial_end, etc.) survive. The general upsertSubscription path
    // demotes-and-inserts when no stripe_subscription_id is in hand,
    // which would null those columns on every tier change.
    await organizationService.updateSubscriptionPlanTierAndSeats({
      subscriptionId: subscription.id,
      planTier: parsed.planTier,
      seatCount: parsed.seatCount,
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
    console.error("[createCheckoutSession] failed", {
      organizationId: parsed.organizationId,
      billingInterval: parsed.billingInterval,
      error: err,
    })
    return { error: errorMessage(err) }
  }
}

export async function createBillingPortalSession(input: {
  organizationId: string
  returnPath?: string
}): Promise<{ url: string } | { error: string }> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  const parsedResult = CreateBillingPortalSessionSchema.safeParse(input)
  if (!parsedResult.success) return invalidInputError()
  const parsed = parsedResult.data

  try {
    const useCase = resolveUseCase<ICreateBillingPortalSessionUseCase>(
      TOKENS.ICreateBillingPortalSessionUseCase
    )
    const result = await useCase.execute({
      organizationId: parsed.organizationId,
      returnPath: parsed.returnPath,
      actor,
    })
    if ("error" in result) return { error: PORTAL_ERROR_MESSAGES[result.error] }
    return { url: result.url }
  } catch (err) {
    // The use-case maps its known failure modes onto the typed error union
    // above; reaching this catch means a programming-level failure (DI miss,
    // exhaustiveness throw, etc.). Don't surface raw error text to the user —
    // the message is logged for on-call to follow up.
    console.error("[createBillingPortalSession] failed", {
      organizationId: parsed.organizationId,
      error: err,
    })
    return { error: "Unable to open billing portal. Please try again." }
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
