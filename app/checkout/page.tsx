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

interface CheckoutPageProps {
  searchParams?: Promise<{
    org?: string | string[]
    intent?: string | string[]
    billing?: string | string[]
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

function isValidIntent(value: string | undefined): value is ValidIntent {
  return value !== undefined && (VALID_INTENTS as readonly string[]).includes(value)
}

function isValidBillingInterval(value: string | undefined): value is ValidBillingInterval {
  return value !== undefined && (VALID_BILLING_INTERVALS as readonly string[]).includes(value)
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

interface ParsedCheckoutParams {
  org: string | undefined
  intent: ValidIntent | undefined
  billing: ValidBillingInterval | undefined
}

function parseCheckoutParams(raw: {
  org?: string | string[]
  intent?: string | string[]
  billing?: string | string[]
}): ParsedCheckoutParams {
  const rawIntent = firstParam(raw.intent)
  const rawBilling = firstParam(raw.billing)
  return {
    org: firstParam(raw.org),
    intent: isValidIntent(rawIntent) ? rawIntent : undefined,
    billing: isValidBillingInterval(rawBilling) ? rawBilling : undefined,
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
  } = parseCheckoutParams(resolvedSearchParams ?? {})

  if (intent) {
    const validatedOrg = rawOrg && orgParamSchema.safeParse(rawOrg).success ? rawOrg : undefined
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
