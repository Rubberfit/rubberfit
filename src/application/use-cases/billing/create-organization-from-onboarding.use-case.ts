import "reflect-metadata"
import { inject, injectable } from "tsyringe"

import { TOKENS } from "@/di/tokens"
import type { IOrganizationService } from "@/src/application/services/organization.service.interface"
import type { ActionActor } from "@/src/application/types/action-actor"

import type { CheckoutPlanTier } from "./billing-plan"

export interface CreateOrganizationFromOnboardingInput {
  companyName: string
  seatCount: number
  planTier: CheckoutPlanTier
  actor: ActionActor
}

export interface CreateOrganizationFromOnboardingResult {
  organizationId: string
}

export interface ICreateOrganizationFromOnboardingUseCase {
  execute(
    input: CreateOrganizationFromOnboardingInput
  ): Promise<CreateOrganizationFromOnboardingResult>
}

@injectable()
export class CreateOrganizationFromOnboardingUseCase implements ICreateOrganizationFromOnboardingUseCase {
  constructor(
    @inject(TOKENS.IOrganizationService)
    private readonly organizationService: IOrganizationService
  ) {}

  async execute(
    input: CreateOrganizationFromOnboardingInput
  ): Promise<CreateOrganizationFromOnboardingResult> {
    if (!Number.isInteger(input.seatCount) || input.seatCount < 1 || input.seatCount > 500) {
      throw new Error("Seat count must be between 1 and 500")
    }

    const companyName = input.companyName.trim()
    if (!companyName) throw new Error("Company name is required")

    const existingOrganization = await this.organizationService.getCurrentOrganizationForUser(
      input.actor.id
    )
    if (existingOrganization) {
      const currentSubscription = await this.organizationService.getCurrentSubscription(
        existingOrganization.id
      )
      if (
        !currentSubscription ||
        currentSubscription.status === "incomplete" ||
        currentSubscription.status === "incomplete_expired"
      ) {
        await this.organizationService.upsertSubscription({
          organization_id: existingOrganization.id,
          plan_tier: input.planTier,
          billing_interval: null,
          seat_count: input.seatCount,
          status: "incomplete",
          is_current: true,
        })
      }
      return { organizationId: existingOrganization.id }
    }

    const organization = await this.organizationService.createOrganization({
      name: companyName,
      billing_email: input.actor.email || null,
      created_by: input.actor.id,
    })

    await this.organizationService.addMember({
      organization_id: organization.id,
      user_id: input.actor.id,
      role: "owner",
      status: "active",
      joined_at: new Date().toISOString(),
    })

    await this.organizationService.upsertSubscription({
      organization_id: organization.id,
      plan_tier: input.planTier,
      billing_interval: null,
      seat_count: input.seatCount,
      status: "incomplete",
      is_current: true,
    })

    return { organizationId: organization.id }
  }
}
