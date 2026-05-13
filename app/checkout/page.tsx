import "reflect-metadata"
import "@/di/resolve"

import { notFound } from "next/navigation"
import { container } from "tsyringe"
import { z } from "zod"

import { TOKENS } from "@/di/tokens"
import { isCheckoutPlanTier } from "@/src/application/use-cases/billing/billing-plan"
import type { IOrganizationService } from "@/src/application/services/organization.service.interface"
import { requireAuthenticatedUser } from "@/app/server/auth/require-authenticated-user"
import { ensureDatabaseFactoryRegistered } from "@/app/server/database/register-factory"

import { CheckoutForm } from "./_components/checkout-form"
import { LockScreenPage } from "./_components/lock-screen-page"
import { TierPicker } from "./_components/tier-picker"

interface CheckoutPageProps {
  searchParams?: Promise<{
    org?: string | string[]
    intent?: string | string[]
    billing?: string | string[]
    edit?: string | string[]
    step?: string | string[]
  }>
}

const orgParamSchema = z.string().uuid()

const VALID_INTENTS = [
  "complete_checkout",
  "needs_workspace",
  "update_billing",
  "restart_subscription",
] as const
type ValidIntent = (typeof VALID_INTENTS)[number]

const VALID_BILLING_INTERVALS = ["monthly", "annual"] as const
type ValidBillingInterval = (typeof VALID_BILLING_INTERVALS)[number]

// The checkout flow is a two-step wizard: `tier` (default — confirm/select
// plan + seats) then `billing` (annual vs monthly + Stripe Checkout). The
// `tier` step also re-prompts when the locked workspace's "Choose a plan"
// button routes here, so users can't silently inherit a marketing-side
// pre-selection.
const VALID_STEPS = ["tier", "billing"] as const
type ValidStep = (typeof VALID_STEPS)[number]

function isValidIntent(value: string | undefined): value is ValidIntent {
  return value !== undefined && (VALID_INTENTS as readonly string[]).includes(value)
}

function isValidBillingInterval(value: string | undefined): value is ValidBillingInterval {
  return value !== undefined && (VALID_BILLING_INTERVALS as readonly string[]).includes(value)
}

function isValidStep(value: string | undefined): value is ValidStep {
  return value !== undefined && (VALID_STEPS as readonly string[]).includes(value)
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

interface ParsedCheckoutParams {
  org: string | undefined
  intent: ValidIntent | undefined
  billing: ValidBillingInterval | undefined
  step: ValidStep | undefined
}

function parseCheckoutParams(raw: {
  org?: string | string[]
  intent?: string | string[]
  billing?: string | string[]
  step?: string | string[]
}): ParsedCheckoutParams {
  const rawIntent = firstParam(raw.intent)
  const rawBilling = firstParam(raw.billing)
  const rawStep = firstParam(raw.step)
  return {
    org: firstParam(raw.org),
    intent: isValidIntent(rawIntent) ? rawIntent : undefined,
    billing: isValidBillingInterval(rawBilling) ? rawBilling : undefined,
    step: isValidStep(rawStep) ? rawStep : undefined,
  }
}

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()

  const resolvedSearchParams = await searchParams
  const {
    org: rawOrg,
    intent,
    billing: initialBillingInterval,
    step,
  } = parseCheckoutParams(resolvedSearchParams ?? {})
  const editFlag = firstParam(resolvedSearchParams?.edit) === "1"

  if (intent) {
    const validatedOrg = rawOrg && orgParamSchema.safeParse(rawOrg).success ? rawOrg : undefined

    // Edit-seats flow: user clicked "Need to change your seat count? Go back."
    // on the checkout form. Render the workspace lock screen with the
    // OnboardingDialog auto-opened and pre-filled with the existing org
    // name + seat count. The use-case is idempotent and updates the
    // pre-checkout subscription row in place.
    if (intent === "needs_workspace" && editFlag && validatedOrg) {
      const organizationService = container.resolve<IOrganizationService>(
        TOKENS.IOrganizationService
      )
      const organization = await organizationService.getOrganizationById(validatedOrg)
      if (organization) {
        const role = await organizationService.getMemberRole(organization.id, actor.id)
        if (role === "owner" || role === "admin") {
          const subscription = await organizationService.getCurrentSubscription(organization.id)
          return (
            <LockScreenPage
              intent={intent}
              orgId={validatedOrg}
              autoOpenOnboarding
              initialCompanyName={organization.name}
              initialSeatCount={subscription?.seat_count}
            />
          )
        }
      }
    }

    return <LockScreenPage intent={intent} orgId={validatedOrg} />
  }

  const parsedOrg = orgParamSchema.safeParse(rawOrg)
  if (!parsedOrg.success) notFound()

  const organizationService = container.resolve<IOrganizationService>(TOKENS.IOrganizationService)
  const organization = await organizationService.getOrganizationById(parsedOrg.data)
  if (!organization) notFound()

  const role = await organizationService.getMemberRole(organization.id, actor.id)
  if (role !== "owner" && role !== "admin") notFound()

  const subscription = await organizationService.getCurrentSubscription(organization.id)
  if (!subscription || !isCheckoutPlanTier(subscription.plan_tier)) notFound()

  // Two-step wizard. Default to the tier picker so users always confirm
  // their plan in-app — marketing-side selections never silently advance
  // to the billing-cycle picker. `step=billing` is set by the tier picker
  // after a successful `selectSubscriptionPlanTier` action.
  if (step !== "billing") {
    return (
      <TierPicker
        orgId={organization.id}
        currentPlanTier={subscription.plan_tier}
        currentSeatCount={subscription.seat_count}
        initialBillingInterval={initialBillingInterval}
      />
    )
  }

  return (
    <CheckoutForm
      orgId={organization.id}
      planTier={subscription.plan_tier}
      seatCount={subscription.seat_count}
      billingEmail={(organization.billing_email ?? actor.email) || null}
      name={organization.name}
      initialBillingInterval={initialBillingInterval}
    />
  )
}
