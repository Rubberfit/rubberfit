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

interface CheckoutPageProps {
  searchParams?: Promise<{ org?: string | string[] }>
}

const orgParamSchema = z.string().uuid()

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()

  const resolvedSearchParams = await searchParams
  const rawOrg = Array.isArray(resolvedSearchParams?.org)
    ? resolvedSearchParams.org[0]
    : resolvedSearchParams?.org
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
