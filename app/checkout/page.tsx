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

function isValidIntent(value: string | undefined): value is ValidIntent {
  return value !== undefined && (VALID_INTENTS as readonly string[]).includes(value)
}

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()

  const resolvedSearchParams = await searchParams
  const rawOrg = Array.isArray(resolvedSearchParams?.org)
    ? resolvedSearchParams.org[0]
    : resolvedSearchParams?.org
  const rawIntent = Array.isArray(resolvedSearchParams?.intent)
    ? resolvedSearchParams.intent[0]
    : resolvedSearchParams?.intent

  const intent = isValidIntent(rawIntent) ? rawIntent : undefined

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
    />
  )
}
