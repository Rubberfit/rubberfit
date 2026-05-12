"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { resolveUseCase } from "@/di/resolve"
import { TOKENS } from "@/di/tokens"
import type { ICreateCheckoutSessionUseCase } from "@/src/application/use-cases/billing/create-checkout-session.use-case"
import type { ICreateOrganizationFromOnboardingUseCase } from "@/src/application/use-cases/billing/create-organization-from-onboarding.use-case"

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

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Billing action failed"
}

export async function createOrganizationFromOnboarding(input: {
  companyName: string
  seatCount: number
  planTier: "standard" | "pro" | "max"
}): Promise<{ organizationId: string } | { error: string }> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  const parsed = CreateOrganizationFromOnboardingSchema.parse(input)

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

export async function createCheckoutSession(input: {
  organizationId: string
  billingInterval: "monthly" | "annual"
}): Promise<{ url: string } | { error: string }> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  const parsed = CreateCheckoutSessionSchema.parse(input)

  try {
    const useCase = resolveUseCase<ICreateCheckoutSessionUseCase>(
      TOKENS.ICreateCheckoutSessionUseCase
    )
    return await useCase.execute({ ...parsed, actor })
  } catch (err) {
    return { error: errorMessage(err) }
  }
}
