import type {
  RecoveryIntent,
  SubscriptionGateResult,
} from "@/src/application/billing/subscription-gate"
import type { ActionActor } from "@/src/application/types/action-actor"
import { getSubscriptionGateForActor } from "@/src/infrastructure/services/organizationBillingService"

type AllowedSubscriptionGate = Extract<SubscriptionGateResult, { kind: "allowed" }>

export class SubscriptionRequiredError extends Error {
  readonly code = "NO_ACTIVE_SUBSCRIPTION" as const
  readonly recovery: RecoveryIntent | "needs_workspace"
  readonly organizationId: string | null

  constructor(params: {
    recovery: RecoveryIntent | "needs_workspace"
    organizationId: string | null
    message?: string
  }) {
    super(params.message ?? "Active subscription required")
    this.name = "SubscriptionRequiredError"
    this.recovery = params.recovery
    this.organizationId = params.organizationId
  }
}

export async function requireActiveSubscription(
  actor: ActionActor
): Promise<AllowedSubscriptionGate> {
  const gate = await getSubscriptionGateForActor(actor)
  if (gate.kind === "allowed") return gate
  if (gate.kind === "needs_workspace") {
    throw new SubscriptionRequiredError({
      recovery: "needs_workspace",
      organizationId: null,
      message: "Organization workspace required",
    })
  }
  throw new SubscriptionRequiredError({
    recovery: gate.recovery,
    organizationId: gate.organizationId,
  })
}
