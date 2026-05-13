const STORAGE_KEY = "rubberfit:onboarding-intent"

const PLAN_VALUES = ["standard", "pro", "max"] as const
const BILLING_VALUES = ["monthly", "annual"] as const

export type OnboardingPlan = (typeof PLAN_VALUES)[number]
export type OnboardingBilling = (typeof BILLING_VALUES)[number]

export interface OnboardingIntent {
  plan: OnboardingPlan
  billing: OnboardingBilling
}

export const DEFAULT_ONBOARDING_INTENT: OnboardingIntent = {
  plan: "pro",
  billing: "annual",
}

function isPlan(value: unknown): value is OnboardingPlan {
  return typeof value === "string" && (PLAN_VALUES as readonly string[]).includes(value)
}

function isBilling(value: unknown): value is OnboardingBilling {
  return typeof value === "string" && (BILLING_VALUES as readonly string[]).includes(value)
}

export function parseOnboardingIntent(input: {
  plan?: string | null
  billing?: string | null
}): Partial<OnboardingIntent> {
  const result: Partial<OnboardingIntent> = {}
  if (isPlan(input.plan)) result.plan = input.plan
  if (isBilling(input.billing)) result.billing = input.billing
  return result
}

export function writeOnboardingIntent(intent: Partial<OnboardingIntent>): void {
  if (typeof window === "undefined") return
  const current = readOnboardingIntent()
  const merged: OnboardingIntent = {
    plan: intent.plan ?? current.plan,
    billing: intent.billing ?? current.billing,
  }
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
  } catch (_error) {
    // sessionStorage can throw in private-mode browsers; fail silently
  }
}

export function readOnboardingIntent(): OnboardingIntent {
  if (typeof window === "undefined") return DEFAULT_ONBOARDING_INTENT
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_ONBOARDING_INTENT
    const parsed = JSON.parse(raw) as unknown
    if (parsed === null || typeof parsed !== "object") return DEFAULT_ONBOARDING_INTENT
    const candidate = parsed as { plan?: unknown; billing?: unknown }
    return {
      plan: isPlan(candidate.plan) ? candidate.plan : DEFAULT_ONBOARDING_INTENT.plan,
      billing: isBilling(candidate.billing) ? candidate.billing : DEFAULT_ONBOARDING_INTENT.billing,
    }
  } catch (_error) {
    return DEFAULT_ONBOARDING_INTENT
  }
}

export function clearOnboardingIntent(): void {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch (_error) {
    // ignore
  }
}
