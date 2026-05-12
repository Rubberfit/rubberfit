"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"

import { parseOnboardingIntent, writeOnboardingIntent } from "@/app/(auth)/_lib/onboarding-intent"

export function OnboardingIntentCapture() {
  const searchParams = useSearchParams()

  React.useEffect(() => {
    const parsed = parseOnboardingIntent({
      plan: searchParams.get("plan"),
      billing: searchParams.get("billing"),
    })
    if (parsed.plan === undefined && parsed.billing === undefined) return
    writeOnboardingIntent(parsed)
  }, [searchParams])

  return null
}
