export type BillingStatus =
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused"

export type RecoveryIntent = "complete_checkout" | "update_billing" | "restart_subscription"

export type SubscriptionGateResult =
  | {
      kind: "allowed"
      organizationId: string
      subscriptionId: string
      status: "trialing" | "active"
      cancelAtPeriodEnd: boolean
      cancelAt: string | null
      currentPeriodEnd: string | null
    }
  | { kind: "needs_workspace" }
  | {
      kind: "blocked"
      organizationId: string
      status: Exclude<BillingStatus, "trialing" | "active"> | "missing"
      recovery: RecoveryIntent
    }

export function isSubscriptionAllowed(status: BillingStatus): boolean {
  return status === "trialing" || status === "active"
}

export function deriveRecoveryIntent(status: BillingStatus): RecoveryIntent {
  switch (status) {
    case "incomplete":
    case "incomplete_expired":
      return "complete_checkout"
    case "past_due":
    case "unpaid":
      return "update_billing"
    case "canceled":
    case "paused":
      return "restart_subscription"
    case "trialing":
    case "active":
      throw new Error(`Allowed subscription status does not need recovery: ${status}`)
  }
}
