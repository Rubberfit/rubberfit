"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"

import { selectSubscriptionPlanTier } from "@/app/actions/billing"
import type { CheckoutPlanTier } from "@/src/application/use-cases/billing/billing-plan"

const EASE = [0.22, 1, 0.36, 1] as const

interface TierMeta {
  code: CheckoutPlanTier
  name: string
  summary: string
  forWho: string
  annualPricePerSeat: number
  monthlyPricePerSeat: number
  features: string[]
  highlighted: boolean
}

// Mirrors `app/checkout/_components/checkout-form.tsx::PRICES` and
// `rubberfit-marketing/src/app/pricing/page.tsx::plans`. Display-only — the
// Stripe Price is resolved server-side from `plan_tier + billing_interval`.
const TIERS: TierMeta[] = [
  {
    code: "standard",
    name: "Standard",
    summary: "Everything an operator needs to receive, plan, cut, and ship.",
    forWho: "Small fabricators, single shop floor.",
    annualPricePerSeat: 159,
    monthlyPricePerSeat: 199,
    features: [
      "Auto Nest + Free-roam",
      "Roll lineage & first-class offcuts",
      "Job lifecycle + customer PDFs",
      "Barcode receiving + scanning",
      "In-app notifications",
      "Six-role RBAC",
    ],
    highlighted: false,
  },
  {
    code: "pro",
    name: "Pro",
    summary: "Standard plus the analytics and audit depth a manager needs.",
    forWho: "Growing fabricators with multi-operator shops.",
    annualPricePerSeat: 279,
    monthlyPricePerSeat: 349,
    features: [
      "Everything in Standard",
      "Full analytics + KPI dashboards",
      "Cut-history exports",
      "Supplier price-history reports",
      "Branded customer PDFs",
      "Priority support · same-day response",
      "Custom barcode formats",
    ],
    highlighted: true,
  },
  {
    code: "max",
    name: "Max",
    summary: "Pro plus the full CRM + AI nesting engine, fully unlocked.",
    forWho: "Mid-market fabricators with sales pipelines and complex jobs.",
    annualPricePerSeat: 559,
    monthlyPricePerSeat: 699,
    features: [
      "Everything in Pro",
      "Full CRM (contacts, accounts, pipeline)",
      "AI-augmented planner",
      "Advanced nesting heuristics",
      "Multi-shop coordination",
      "Cross-team operator scheduling",
      "Phone support",
    ],
    highlighted: false,
  },
]

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M4 10L8 14L16 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export interface TierPickerProps {
  orgId: string
  currentPlanTier: CheckoutPlanTier
  currentSeatCount: number
  initialBillingInterval?: "monthly" | "annual"
}

export function TierPicker({
  orgId,
  currentPlanTier,
  currentSeatCount,
  initialBillingInterval,
}: TierPickerProps) {
  const router = useRouter()
  const [selectedTier, setSelectedTier] = React.useState<CheckoutPlanTier>(currentPlanTier)
  const [seatCount, setSeatCount] = React.useState(currentSeatCount)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleContinue() {
    setIsSubmitting(true)
    setError(null)

    const result = await selectSubscriptionPlanTier({
      organizationId: orgId,
      planTier: selectedTier,
      seatCount,
    })

    if ("error" in result) {
      setError(result.error)
      setIsSubmitting(false)
      return
    }

    const billingQuery = initialBillingInterval ? `&billing=${initialBillingInterval}` : ""
    router.push(`/checkout?org=${orgId}&step=billing${billingQuery}`)
  }

  return (
    <div className="min-h-screen bg-[var(--background)] font-[family-name:var(--font-sans)] text-[var(--color-graphite)]">
      <header className="flex items-center justify-between px-6 py-5 md:px-10">
        <Link href="/" className="flex items-center gap-3" aria-label="Rubberfit home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/rubberfit-mark.svg" alt="" width={32} height={32} aria-hidden="true" />
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-ink-soft)]">
            Rubberfit
          </span>
        </Link>
        <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-ink-soft)]">
          Rev · 2026.05
        </span>
      </header>

      <motion.main
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
        className="mx-auto max-w-[960px] px-6 pb-24 pt-8 md:pt-16"
      >
        <h1 className="font-[family-name:var(--font-display)] text-[32px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-graphite)] md:text-[40px]">
          Choose your plan.
        </h1>
        <p className="mt-3 text-[15px] text-[var(--color-ink-soft)]">
          Confirm the tier that fits your shop. You can change billing cycle on the next step.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          {TIERS.map((tier) => {
            const isSelected = selectedTier === tier.code
            return (
              <button
                key={tier.code}
                type="button"
                onClick={() => setSelectedTier(tier.code)}
                aria-pressed={isSelected}
                className={`relative rounded border bg-white p-6 text-left transition-all duration-[180ms] ${
                  isSelected
                    ? "border-[var(--color-signal)]"
                    : "border-[rgba(20,23,27,0.12)] hover:border-[var(--color-graphite)] hover:shadow-[0_2px_8px_rgba(20,23,27,0.06)]"
                }`}
              >
                {isSelected && (
                  <CheckIcon className="absolute right-4 top-4 text-[var(--color-signal)]" />
                )}
                {tier.highlighted && !isSelected && (
                  <span className="absolute right-4 top-4 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-signal)]">
                    Most popular
                  </span>
                )}
                <span className="block font-[family-name:var(--font-display)] text-base font-semibold text-[var(--color-graphite)]">
                  {tier.name}
                </span>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="font-[family-name:var(--font-display)] text-[40px] font-semibold tracking-tight text-[var(--color-graphite)] tabular-nums">
                    ${tier.annualPricePerSeat}
                  </span>
                  <span className="text-sm text-[var(--color-ink-soft)]">/ seat / mo</span>
                </div>
                <span className="mt-2 block font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-ink-soft)]">
                  ${tier.monthlyPricePerSeat} / SEAT / MO BILLED MONTHLY
                </span>
                <p className="mt-4 text-[14px] leading-relaxed text-[var(--color-graphite)]">
                  {tier.summary}
                </p>
                <p className="mt-2 text-[13px] text-[var(--color-ink-soft)]">{tier.forWho}</p>
                <ul className="mt-4 space-y-1.5">
                  {tier.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-[13px] text-[var(--color-graphite)]"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-[var(--color-signal)]"
                      />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </button>
            )
          })}
        </div>

        <div className="mt-8 border-t border-[var(--color-rule)] pt-6">
          <label
            htmlFor="tier-picker-seat-count"
            className="block font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-ink-soft)]"
          >
            Seats
          </label>
          <input
            id="tier-picker-seat-count"
            name="seatCount"
            type="number"
            min={1}
            max={500}
            value={seatCount}
            onChange={(e) => setSeatCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
            disabled={isSubmitting}
            className="auth-input-minimal mt-2 max-w-[120px]"
          />
          <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-ink-soft)]">
            Includes you. Add teammates after checkout.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded border border-[var(--color-signal)] bg-[var(--color-signal)]/10 px-3 py-2.5 text-sm font-medium text-[var(--color-signal)]"
          >
            {error}
          </div>
        )}

        <div className="mx-auto mt-8 max-w-[420px]">
          <button
            type="button"
            onClick={handleContinue}
            disabled={isSubmitting}
            className="auth-btn-primary w-full disabled:opacity-60"
          >
            {isSubmitting ? "Saving…" : "Continue to billing cycle →"}
          </button>

          <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-soft)]">
            14-DAY TRIAL · SECURED BY STRIPE · NO CHARGE TODAY.
          </p>
        </div>
      </motion.main>
    </div>
  )
}
