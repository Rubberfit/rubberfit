"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"

import { createCheckoutSession } from "@/app/actions/billing"
import type { CheckoutPlanTier } from "@/src/application/use-cases/billing/billing-plan"

const EASE = [0.22, 1, 0.36, 1] as const

const PRICES: Record<
  CheckoutPlanTier,
  { monthly: number; annual: number; annualSavings: number; annualTotalPerSeat: number }
> = {
  standard: { monthly: 199, annual: 159, annualSavings: 480, annualTotalPerSeat: 1908 },
  pro: { monthly: 349, annual: 279, annualSavings: 840, annualTotalPerSeat: 3348 },
  max: { monthly: 699, annual: 559, annualSavings: 1680, annualTotalPerSeat: 6708 },
}

export interface CheckoutFormProps {
  orgId: string
  planTier: CheckoutPlanTier
  seatCount: number
  billingEmail: string | null
  name: string
}

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

export function CheckoutForm({ orgId, planTier, seatCount }: CheckoutFormProps) {
  const router = useRouter()
  const [billingInterval, setBillingInterval] = React.useState<"annual" | "monthly">("annual")
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const price = PRICES[planTier]
  const total =
    billingInterval === "annual" ? price.annual * seatCount * 12 : price.monthly * seatCount

  async function handleCheckout() {
    setIsSubmitting(true)
    setError(null)

    const result = await createCheckoutSession({
      organizationId: orgId,
      billingInterval,
    })

    if ("error" in result) {
      setError(result.error)
      setIsSubmitting(false)
      return
    }

    window.location.assign(result.url)
  }

  const tierLabel = planTier.charAt(0).toUpperCase() + planTier.slice(1)
  const seatNoun = seatCount === 1 ? "seat" : "seats"
  const seatNounCaps = seatCount === 1 ? "SEAT" : "SEATS"

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
        className="mx-auto max-w-[720px] px-6 pb-24 pt-8 md:pt-16"
      >
        <h1 className="font-[family-name:var(--font-display)] text-[32px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-graphite)] md:text-[40px]">
          Choose your billing cycle.
        </h1>
        <p className="mt-3 text-[15px] text-[var(--color-ink-soft)]">
          {tierLabel} · {seatCount} {seatNoun} · 14-day trial.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setBillingInterval("annual")}
            aria-pressed={billingInterval === "annual"}
            className={`relative rounded border bg-white p-6 text-left transition-all duration-[180ms] ${
              billingInterval === "annual"
                ? "border-[var(--color-signal)]"
                : "border-[rgba(20,23,27,0.12)] hover:border-[var(--color-graphite)] hover:shadow-[0_2px_8px_rgba(20,23,27,0.06)]"
            }`}
          >
            {billingInterval === "annual" && (
              <CheckIcon className="absolute right-4 top-4 text-[var(--color-signal)]" />
            )}
            <span className="block font-[family-name:var(--font-display)] text-base font-semibold text-[var(--color-graphite)]">
              Annual
            </span>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="font-[family-name:var(--font-display)] text-[40px] font-semibold tracking-tight text-[var(--color-graphite)] tabular-nums">
                ${price.annual}
              </span>
              <span className="text-sm text-[var(--color-ink-soft)]">
                / seat / mo billed yearly
              </span>
            </div>
            <span className="mt-2 block font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-ink-soft)]">
              ${price.annualTotalPerSeat.toLocaleString()} / SEAT / YEAR
            </span>
            <span className="mt-3 inline-block font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-signal)]">
              SAVE ${price.annualSavings} PER SEAT
            </span>
          </button>

          <button
            type="button"
            onClick={() => setBillingInterval("monthly")}
            aria-pressed={billingInterval === "monthly"}
            className={`relative rounded border bg-white p-6 text-left transition-all duration-[180ms] ${
              billingInterval === "monthly"
                ? "border-[var(--color-signal)]"
                : "border-[rgba(20,23,27,0.12)] hover:border-[var(--color-graphite)] hover:shadow-[0_2px_8px_rgba(20,23,27,0.06)]"
            }`}
          >
            {billingInterval === "monthly" && (
              <CheckIcon className="absolute right-4 top-4 text-[var(--color-signal)]" />
            )}
            <span className="block font-[family-name:var(--font-display)] text-base font-semibold text-[var(--color-graphite)]">
              Monthly
            </span>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="font-[family-name:var(--font-display)] text-[40px] font-semibold tracking-tight text-[var(--color-graphite)] tabular-nums">
                ${price.monthly}
              </span>
              <span className="text-sm text-[var(--color-ink-soft)]">/ seat / mo</span>
            </div>
            <span className="mt-2 block font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-ink-soft)]">
              ${(price.monthly * 12).toLocaleString()} / SEAT / YEAR
            </span>
          </button>
        </div>

        <div className="mt-8 flex items-end justify-between border-t border-[var(--color-rule)] pt-6">
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-ink-soft)]">
            TOTAL FOR {seatCount} {seatNounCaps}
          </span>
          <span className="font-[family-name:var(--font-display)] text-[32px] font-semibold tracking-tight text-[var(--color-graphite)] tabular-nums">
            ${total.toLocaleString()}
          </span>
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
            onClick={handleCheckout}
            disabled={isSubmitting}
            className="auth-btn-primary w-full disabled:opacity-60"
          >
            {isSubmitting ? "Creating session…" : "Start 14-day trial →"}
          </button>

          <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-soft)]">
            SECURED BY STRIPE · CANCEL ANYTIME IN THE FIRST 14 DAYS · NO CHARGE TODAY.
          </p>

          <button
            type="button"
            onClick={() => router.back()}
            className="mt-4 block w-full text-center font-[family-name:var(--font-sans)] text-[13px] text-[var(--color-ink-soft)] transition-colors hover:text-[var(--color-signal)]"
          >
            Need to change your seat count? Go back.
          </button>
        </div>
      </motion.main>
    </div>
  )
}
