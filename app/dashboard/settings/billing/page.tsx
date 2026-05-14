import { format } from "date-fns"
import Link from "next/link"

import { getBillingSummary, type BillingSummaryData } from "@/app/actions/billing-summary"

import { StatusPill } from "@/app/components/billing/StatusPill"
import { ManageSubscriptionButton } from "./_components/manage-subscription-button"

export const dynamic = "force-dynamic"

/**
 * Per-seat pricing for the three paid retail tiers. Used to render
 * the comparison grid math (`$X/mo × seats = $TOTAL/mo`). Mirrors
 * the marketing pricing page (`rubberfit-marketing/src/app/pricing/
 * page.tsx`) — when the marketing copy changes, this map shifts in
 * lockstep, same as `FEATURE_TIERS`.
 */
const PRICING = {
  standard: { monthly: 199, annual: 159 },
  pro: { monthly: 349, annual: 279 },
  max: { monthly: 699, annual: 559 },
} as const

const TIER_ORDER: Record<"standard" | "pro" | "max" | "enterprise", number> = {
  standard: 0,
  pro: 1,
  max: 2,
  enterprise: 3,
}

const RETAIL_TIERS = ["standard", "pro", "max"] as const

const TIER_TAGLINES: Record<(typeof RETAIL_TIERS)[number], string> = {
  standard: "Operational floor — receive, plan, cut, ship.",
  pro: "Standard plus analytics, exports, branded PDFs.",
  max: "Pro plus full CRM, AI planner, advanced nesting.",
}

/**
 * Customer-facing landing for plan management. Server component —
 * data loaded synchronously via `getBillingSummary` so there's no
 * render flash on what is effectively read-only state.
 *
 * The Upgrade / Downgrade tier-switch buttons in `ComparePlansGrid`
 * remain visual-only; tier changes still route through support. The
 * "Manage your subscription" block below mints a real Stripe Billing
 * Portal session via `createBillingPortalSession`.
 */
export default async function BillingPage() {
  const data = await getBillingSummary()
  const interval: "monthly" | "annual" = data.billingInterval ?? "monthly"
  const isEnterprise = data.tier === "enterprise"
  const renewalDate = data.currentPeriodEnd
    ? format(new Date(data.currentPeriodEnd), "MMMM d, yyyy")
    : "—"
  const intervalLabel = data.billingInterval
    ? data.billingInterval === "annual"
      ? "Annual"
      : "Monthly"
    : "—"

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <BillingHeader data={data} />

      <CurrentPlanCard
        data={data}
        interval={interval}
        renewalDate={renewalDate}
        intervalLabel={intervalLabel}
      />

      {isEnterprise ? (
        <EnterpriseManagementBlock />
      ) : (
        <ComparePlansGrid currentTier={data.tier} interval={interval} seatCount={data.seatCount} />
      )}

      <ManageSubscriptionBlock organizationId={data.organizationId} isEnterprise={isEnterprise} />
      <ContactSupportBlock />
    </div>
  )
}

function BillingHeader({ data }: { data: BillingSummaryData }) {
  return (
    <div className="mb-8">
      <h2 className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.22em] text-[var(--color-signal)]">
        /BILLING &amp; PLAN
      </h2>
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-[28px] font-medium leading-tight text-[var(--color-graphite)]">
        Manage subscription
      </h1>
      <p className="mt-1 font-[family-name:var(--font-sans)] text-[14px] text-[var(--color-ink-soft)]">
        {data.organizationName} · {data.seatCount} active {data.seatCount === 1 ? "seat" : "seats"}
      </p>
    </div>
  )
}

function CurrentPlanCard({
  data,
  interval,
  renewalDate,
  intervalLabel,
}: {
  data: BillingSummaryData
  interval: "monthly" | "annual"
  renewalDate: string
  intervalLabel: string
}) {
  const isEnterprise = data.tier === "enterprise"
  const tierLabel = data.tier.toUpperCase()
  const retailTier = isEnterprise ? null : (data.tier as (typeof RETAIL_TIERS)[number])
  const unit = retailTier ? PRICING[retailTier][interval] : null
  const total = unit !== null ? unit * data.seatCount : null

  return (
    <section
      className={`mb-10 border border-[var(--color-rule)] bg-[var(--color-surface-raised)] ${
        isEnterprise ? "border-l-2 border-l-[var(--color-signal)]" : ""
      }`}
    >
      <div className="border-b border-[var(--color-rule)] px-6 py-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">
              Current plan
            </div>
            <div className="mt-2 flex items-center gap-3">
              <span className="font-[family-name:var(--font-display)] text-[28px] font-medium uppercase leading-none text-[var(--color-ink)]">
                {tierLabel}
              </span>
              <BillingStatusPill status={data.status} />
            </div>
            {isEnterprise ? (
              <p className="mt-3 max-w-[44ch] font-[family-name:var(--font-sans)] text-[14px] text-[var(--color-ink-soft)]">
                Fixed-rate contract, no per-seat metering. Changes go through your Arc &amp; Anchor
                account manager.
              </p>
            ) : (
              <p className="mt-3 font-[family-name:var(--font-mono)] text-[13px] text-[var(--color-ink-soft)]">
                ${unit}/seat/mo × {data.seatCount} {data.seatCount === 1 ? "seat" : "seats"} = $
                {total?.toLocaleString("en-US")}/mo
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 divide-y divide-[var(--color-rule)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <SpecCell label="Billing interval" value={intervalLabel} />
        <SpecCell label="Seats" value={String(data.seatCount)} />
        <SpecCell
          label={data.status === "trialing" ? "Trial ends" : "Next renewal"}
          value={renewalDate}
        />
      </div>
    </section>
  )
}

function SpecCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-6 py-5">
      <p className="mb-1 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">
        {label}
      </p>
      <p className="font-[family-name:var(--font-mono)] text-[13px] text-[var(--color-ink)]">
        {value}
      </p>
    </div>
  )
}

function ComparePlansGrid({
  currentTier,
  interval,
  seatCount,
}: {
  currentTier: "standard" | "pro" | "max" | "enterprise"
  interval: "monthly" | "annual"
  seatCount: number
}) {
  return (
    <section className="mb-10">
      <div className="mb-4 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">
        Compare plans
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {RETAIL_TIERS.map((tier) => (
          <PlanCard
            key={tier}
            tier={tier}
            currentTier={currentTier}
            interval={interval}
            seatCount={seatCount}
          />
        ))}
      </div>
      <p className="mt-4 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">
        Annual billing · save 20% · paid upfront
      </p>
    </section>
  )
}

function PlanCard({
  tier,
  currentTier,
  interval,
  seatCount,
}: {
  tier: (typeof RETAIL_TIERS)[number]
  currentTier: "standard" | "pro" | "max" | "enterprise"
  interval: "monthly" | "annual"
  seatCount: number
}) {
  const isCurrent = currentTier === tier
  const isEnterprise = currentTier === "enterprise"
  const targetIndex = TIER_ORDER[tier]
  const currentIndex = TIER_ORDER[currentTier]
  const direction =
    isCurrent || isEnterprise ? null : targetIndex > currentIndex ? "upgrade" : "downgrade"
  const unit = PRICING[tier][interval]
  const total = unit * seatCount
  const altUnit = interval === "annual" ? PRICING[tier].monthly : PRICING[tier].annual

  const actionLabel = isCurrent
    ? "Current plan"
    : isEnterprise
      ? "Already at Enterprise"
      : direction === "upgrade"
        ? "Upgrade"
        : "Downgrade"

  const actionDisabled = isCurrent || isEnterprise
  const actionVariant: "primary" | "ghost" = direction === "upgrade" ? "primary" : "ghost"

  return (
    <div
      className={`flex flex-col border bg-[var(--color-surface-raised)] p-5 ${
        isCurrent
          ? "border-t-2 border-[var(--color-rule)] border-t-[var(--color-signal)]"
          : "border-[var(--color-rule)]"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.22em] text-[var(--color-ink)]">
          {tier.toUpperCase()}
        </div>
        {isCurrent ? (
          <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.16em] text-[var(--color-signal)]">
            ACTIVE
          </span>
        ) : null}
      </div>

      <p className="mt-3 min-h-[2.5em] font-[family-name:var(--font-sans)] text-[13px] leading-snug text-[var(--color-ink-soft)]">
        {TIER_TAGLINES[tier]}
      </p>

      <div className="mt-5 border-t border-[var(--color-rule)] pt-4">
        <div className="flex items-baseline gap-2">
          <span className="font-[family-name:var(--font-display)] text-[28px] font-medium text-[var(--color-ink)]">
            ${unit}
          </span>
          <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
            / seat / {interval === "annual" ? "mo · annual" : "month"}
          </span>
        </div>
        <p className="mt-2 font-[family-name:var(--font-mono)] text-[12px] text-[var(--color-ink-soft)]">
          ${total.toLocaleString("en-US")}/mo for {seatCount} {seatCount === 1 ? "seat" : "seats"}
        </p>
        <p className="mt-1 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
          {interval === "annual" ? `or $${altUnit}/seat monthly` : `or $${altUnit}/seat annual`}
        </p>
      </div>

      <div className="mt-auto pt-5">
        <button
          type="button"
          disabled={actionDisabled}
          aria-disabled={actionDisabled}
          title={
            actionDisabled
              ? actionLabel
              : "Plan changes are handled through the Stripe Customer Portal — coming soon. Email support@rubberfit.app to switch in the meantime."
          }
          className={
            actionDisabled
              ? "inline-flex h-11 w-full cursor-not-allowed items-center justify-center border border-[var(--color-rule)] bg-[var(--color-surface)] font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)]"
              : actionVariant === "primary"
                ? "inline-flex h-11 w-full items-center justify-center bg-[var(--color-signal)] font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--color-canvas)] transition-colors hover:bg-[var(--color-signal-deep)] active:translate-y-px"
                : "inline-flex h-11 w-full items-center justify-center border border-[var(--color-graphite)] bg-transparent font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--color-graphite)] transition-colors hover:bg-[var(--color-graphite)] hover:text-[var(--color-canvas)]"
          }
        >
          {actionLabel}
        </button>
      </div>
    </div>
  )
}

function EnterpriseManagementBlock() {
  return (
    <section className="mb-10 border border-l-2 border-[var(--color-rule)] border-l-[var(--color-signal)] bg-[var(--color-surface-raised)] p-6">
      <div className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.22em] text-[var(--color-signal)]">
        /CONTRACT
      </div>
      <h2 className="mt-2 font-[family-name:var(--font-display)] text-[20px] font-medium text-[var(--color-ink)]">
        Active Enterprise contract
      </h2>
      <p className="mt-2 max-w-[60ch] font-[family-name:var(--font-sans)] text-[14px] leading-relaxed text-[var(--color-ink-soft)]">
        Enterprise customers are on fixed-rate contracts — no per-seat metering and no retail
        upgrades / downgrades. For seat changes, contract renewal, or billing questions, reach out
        to your Arc &amp; Anchor account manager directly.
      </p>
      <a
        href="mailto:sales@rubberfit.app?subject=Enterprise%20contract%20change"
        className="mt-5 inline-flex h-11 items-center justify-center bg-[var(--color-graphite)] px-6 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--color-canvas)] transition-colors hover:bg-[var(--color-ink)] active:translate-y-px"
      >
        Email account manager
      </a>
    </section>
  )
}

function ManageSubscriptionBlock({
  organizationId,
  isEnterprise,
}: {
  organizationId: string
  isEnterprise: boolean
}) {
  return (
    <section className="mb-10 border border-[var(--color-rule)] bg-[var(--color-surface-raised)] p-6">
      <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.22em] text-[var(--color-ink-faint)]">
        /BILLING
      </p>
      <h2 className="mt-2 font-[family-name:var(--font-display)] text-[20px] font-medium text-[var(--color-ink)]">
        Manage your subscription
      </h2>
      <p className="mt-2 max-w-[60ch] font-[family-name:var(--font-sans)] text-[14px] leading-relaxed text-[var(--color-ink-soft)]">
        Open the Stripe Customer Portal to update your card, cancel, and pull invoices.
      </p>

      {isEnterprise ? (
        <p className="mt-5 max-w-[60ch] font-[family-name:var(--font-sans)] text-[13px] text-[var(--color-ink-soft)]">
          Enterprise customers are on fixed-rate contracts. Use the link above to reach your account
          manager.
        </p>
      ) : (
        <>
          <div className="mt-5">
            <ManageSubscriptionButton organizationId={organizationId} />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 font-[family-name:var(--font-sans)] text-[13px] text-[var(--color-ink-soft)]">
            <p>
              <span className="text-[var(--color-signal)]">• </span>
              <strong>Change plan</strong> — upgrade or downgrade tiers
            </p>
            <p>
              <span className="text-[var(--color-signal)]">• </span>
              <strong>Update payment method</strong> — replace card on file
            </p>
            <p>
              <span className="text-[var(--color-signal)]">• </span>
              <strong>View &amp; download invoices</strong> — receipt + tax document access
            </p>
            <p>
              <span className="text-[var(--color-signal)]">• </span>
              <strong>Update profile + tax ID</strong> — billing address, VAT/EIN
            </p>
            <p>
              <span className="text-[var(--color-signal)]">• </span>
              <strong>Cancel subscription</strong> — stops at period end
            </p>
          </div>
        </>
      )}

      <div className="mt-6 flex flex-col gap-3 border-t border-[var(--color-rule)] pt-6 font-[family-name:var(--font-mono)] text-[12px] uppercase tracking-[0.12em] text-[var(--color-ink)]">
        <Link
          href="/dashboard/settings/billing/history"
          className="underline-offset-4 hover:underline"
        >
          View payment history →
        </Link>
        <a
          href="https://get.rubberfit.app/pricing"
          target="_blank"
          rel="noreferrer noopener"
          className="underline-offset-4 hover:underline"
        >
          Compare features →
        </a>
      </div>
    </section>
  )
}

function ContactSupportBlock() {
  return (
    <section className="mt-10 border-t border-[var(--color-rule)] pt-8">
      <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.22em] text-[var(--color-ink-faint)]">
        /SUPPORT
      </p>
      <p className="mt-2 max-w-[60ch] font-[family-name:var(--font-sans)] text-[14px] leading-relaxed text-[var(--color-ink-soft)]">
        Questions about billing, contracts, or your account? Email{" "}
        <a
          href="mailto:support@rubberfit.app"
          className="text-[var(--color-ink)] underline-offset-4 hover:underline"
        >
          support@rubberfit.app
        </a>{" "}
        and we&apos;ll respond within one business day.
      </p>
    </section>
  )
}

function BillingStatusPill({ status }: { status: BillingSummaryData["status"] }) {
  if (status === "trialing") {
    return <StatusPill status="pending" />
  }
  return <StatusPill status="paid" />
}
