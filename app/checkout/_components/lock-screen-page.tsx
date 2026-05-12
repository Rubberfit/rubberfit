"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { IconCircle } from "@/app/components/billing/IconCircle"
import { LockCard } from "@/app/components/billing/LockCard"
import { LockScreen } from "@/app/components/billing/LockScreen"
import { OnboardingDialog } from "@/app/(auth)/_components/onboarding-dialog"
import {
  DEFAULT_ONBOARDING_INTENT,
  readOnboardingIntent,
  type OnboardingIntent,
} from "@/app/(auth)/_lib/onboarding-intent"
import { createBillingPortalSession } from "@/app/actions/billing"

type Intent = "complete_checkout" | "needs_workspace" | "update_billing" | "restart_subscription"

interface LockScreenPageProps {
  intent: Intent
  orgId?: string
}

interface IntentConfig {
  h2: string
  body: string
  primaryLabel: string
  primaryAction: () => void
  secondaryHref: string
  secondaryLabel: string
  tertiaryHref: string
  tertiaryLabel: string
}

export function LockScreenPage({ intent, orgId }: LockScreenPageProps) {
  const router = useRouter()
  const [showOnboarding, setShowOnboarding] = React.useState(false)
  const [billingError, setBillingError] = React.useState<string | null>(null)
  const [isOpeningPortal, setIsOpeningPortal] = React.useState(false)
  const [onboardingIntent, setOnboardingIntent] =
    React.useState<OnboardingIntent>(DEFAULT_ONBOARDING_INTENT)

  React.useEffect(() => {
    setOnboardingIntent(readOnboardingIntent())
  }, [])

  const goToCheckout = React.useCallback(() => {
    if (orgId) {
      router.push(`/checkout?org=${orgId}`)
    } else {
      router.push("/register")
    }
  }, [orgId, router])

  const handleUpdateBilling = React.useCallback(async () => {
    setBillingError(null)
    setIsOpeningPortal(true)
    try {
      const result = await createBillingPortalSession()
      if ("error" in result) {
        setBillingError(result.error)
        return
      }
      window.location.assign(result.url)
    } catch (_err) {
      setBillingError("Unable to open billing portal.")
    } finally {
      setIsOpeningPortal(false)
    }
  }, [])

  const configs: Record<Intent, IntentConfig> = {
    complete_checkout: {
      h2: "Start your subscription.",
      body: "Your workspace is created but needs an active plan to unlock Rubberfit.",
      primaryLabel: "Choose a plan →",
      primaryAction: goToCheckout,
      secondaryHref: "mailto:sales@rubberfit.com",
      secondaryLabel: "Contact sales",
      tertiaryHref: "/logout",
      tertiaryLabel: "Log out",
    },
    needs_workspace: {
      h2: "Set up your workspace.",
      body: "Tell us about your team to start your 14-day trial.",
      primaryLabel: "Continue",
      primaryAction: () => setShowOnboarding(true),
      secondaryHref: "mailto:sales@rubberfit.com",
      secondaryLabel: "Contact sales",
      tertiaryHref: "/logout",
      tertiaryLabel: "Log out",
    },
    update_billing: {
      h2: "Update your billing.",
      body: "Your last payment didn't go through. Update your card to resume Rubberfit.",
      primaryLabel: isOpeningPortal ? "Opening portal…" : "Update billing",
      primaryAction: handleUpdateBilling,
      secondaryHref: "mailto:support@rubberfit.app",
      secondaryLabel: "Contact support",
      tertiaryHref: "/logout",
      tertiaryLabel: "Log out",
    },
    restart_subscription: {
      h2: "Restart your subscription.",
      body: "Your plan ended. Pick a plan to bring Rubberfit back online.",
      primaryLabel: "Choose a plan →",
      primaryAction: goToCheckout,
      secondaryHref: "mailto:support@rubberfit.app",
      secondaryLabel: "Contact support",
      tertiaryHref: "/logout",
      tertiaryLabel: "Log out",
    },
  }

  const config = configs[intent]

  return (
    <LockScreen hideSidebar>
      <LockCard maxW="md">
        <div className="mb-6">
          <IconCircle variant="lock" size={48} stroke="var(--color-signal)" />
        </div>
        <h2 className="mb-3 font-[family-name:var(--font-display)] text-[32px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-graphite)] md:text-[40px]">
          {config.h2}
        </h2>
        <p className="mb-8 max-w-xs text-[15px] leading-relaxed text-[var(--color-ink-soft)]">
          {config.body}
        </p>
        <div className="flex w-full flex-col items-center gap-3">
          <button
            type="button"
            onClick={config.primaryAction}
            disabled={intent === "update_billing" && isOpeningPortal}
            className="auth-btn-primary w-full disabled:opacity-60"
          >
            {config.primaryLabel}
          </button>
          <Link href={config.secondaryHref} className="auth-link text-[14px]">
            {config.secondaryLabel}
          </Link>
          <Link
            href={config.tertiaryHref}
            prefetch={false}
            className="auth-link text-[14px] opacity-60 hover:opacity-100"
          >
            {config.tertiaryLabel}
          </Link>
        </div>
        {billingError ? (
          <p role="alert" className="mt-4 text-[13px] text-[var(--color-signal)]">
            {billingError}
          </p>
        ) : null}
      </LockCard>
      {showOnboarding ? (
        <OnboardingDialog
          open={showOnboarding}
          planTier={onboardingIntent.plan}
          billingInterval={onboardingIntent.billing}
        />
      ) : null}
    </LockScreen>
  )
}
