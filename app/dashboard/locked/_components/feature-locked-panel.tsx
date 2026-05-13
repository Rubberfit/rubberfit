"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "framer-motion"

const EASE = [0.22, 1, 0.36, 1] as const

interface FeatureLockedPanelProps {
  pathLabel: string
  headline: string
  body: string
  tierLabel: string | null
  tierPrice: string | null
  missingFeatures: string[]
  missingOverflow: number
  from: string | null
}

/**
 * Route-level lock screen per Kimi spec. The schematic ghost layer
 * (six empty wireframe rectangles built from 1px hairlines on the
 * canvas background) sits behind a frost overlay; the LockCard with
 * tickmark brackets and 2px signal-orange left border sits on top.
 *
 * Kept inside `app/dashboard/locked/` so the dashboard layout's
 * sidebar still wraps it — the lock screen replaces the page body,
 * not the entire chrome, which matches the upgrade-flagship intent
 * (user stays oriented inside the workspace they're trying to
 * upgrade in).
 */
export function FeatureLockedPanel({
  pathLabel,
  headline,
  body,
  tierLabel,
  tierPrice,
  missingFeatures,
  missingOverflow,
  from,
}: FeatureLockedPanelProps) {
  const primaryCta =
    tierLabel && tierPrice ? `Upgrade to ${tierLabel} — ${tierPrice}` : "View plans"

  return (
    <div className="relative isolate flex min-h-[calc(100vh-8rem)] w-full items-center justify-center px-6 py-12">
      <SchematicGhost />
      <FrostOverlay />
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="relative z-10 w-[min(640px,calc(100%-48px))] border border-l-2 border-[var(--color-rule)] border-l-[var(--color-signal)] bg-[var(--color-surface-raised)] p-12"
      >
        <TickmarkBrackets />
        <div className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.22em] text-[var(--color-signal)]">
          {pathLabel}
        </div>
        <h1 className="mt-5 font-[family-name:var(--font-display)] text-[28px] font-medium leading-[1.1] text-[var(--color-graphite)]">
          {headline}
        </h1>
        <p className="mt-3 max-w-[52ch] text-[14px] leading-[1.5] text-[var(--color-ink-soft)]">
          {body}
        </p>
        {missingFeatures.length > 0 ? (
          <MissingList items={missingFeatures} overflow={missingOverflow} />
        ) : null}
        {from ? (
          <div className="mt-6 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">
            Attempted: {from}
          </div>
        ) : null}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/dashboard/settings/billing"
            className="inline-flex h-11 items-center justify-center bg-[var(--color-signal)] px-6 font-[family-name:var(--font-mono)] text-[12px] uppercase tracking-[0.05em] text-[var(--color-canvas)] transition-colors duration-150 hover:bg-[var(--color-signal-deep)] active:translate-y-px"
          >
            {primaryCta}
          </Link>
          <Link
            href="/dashboard/settings/billing?intent=trial"
            className="inline-flex h-11 items-center justify-center border border-[var(--color-graphite)] px-6 font-[family-name:var(--font-mono)] text-[12px] uppercase tracking-[0.05em] text-[var(--color-graphite)] transition-colors duration-150 hover:bg-[var(--color-graphite)] hover:text-[var(--color-canvas)]"
          >
            Start 14-day trial
          </Link>
          <Link
            href="mailto:sales@rubberfit.com"
            className="font-[family-name:var(--font-mono)] text-[12px] text-[var(--color-ink-soft)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
          >
            Contact sales
          </Link>
        </div>
      </motion.div>
    </div>
  )
}

function SchematicGhost() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 grid grid-cols-3 grid-rows-2 gap-6 p-6 opacity-[0.12]"
    >
      <div className="border border-[var(--color-graphite)]" />
      <div className="col-span-2 border border-[var(--color-graphite)]" />
      <div className="border border-[var(--color-graphite)]" />
      <div className="border border-[var(--color-graphite)]" />
      <div className="border border-[var(--color-graphite)]" />
    </div>
  )
}

function FrostOverlay() {
  return (
    <div aria-hidden="true" className="absolute inset-0 z-[5] bg-[var(--color-canvas)]/[0.92]" />
  )
}

function TickmarkBrackets() {
  const arm = "18px"
  const inset = "12px"
  const stroke = "1px solid var(--color-rule)"
  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{
          top: inset,
          left: inset,
          width: arm,
          height: arm,
          borderTop: stroke,
          borderLeft: stroke,
        }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{
          top: inset,
          right: inset,
          width: arm,
          height: arm,
          borderTop: stroke,
          borderRight: stroke,
        }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{
          bottom: inset,
          left: inset,
          width: arm,
          height: arm,
          borderBottom: stroke,
          borderLeft: stroke,
        }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{
          bottom: inset,
          right: inset,
          width: arm,
          height: arm,
          borderBottom: stroke,
          borderRight: stroke,
        }}
      />
    </>
  )
}

function MissingList({ items, overflow }: { items: string[]; overflow: number }) {
  return (
    <div className="mt-6">
      <div className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">
        What you&apos;re missing
      </div>
      <ul className="mt-3 space-y-1.5">
        {items.map((item) => (
          <li
            key={item}
            className="flex items-baseline gap-2 text-[13px] text-[var(--color-ink-soft)]"
          >
            <span aria-hidden="true" className="text-[14px] text-[var(--color-ink-faint)]">
              ×
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
      {overflow > 0 ? (
        <div className="mt-2 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">
          + {overflow} more
        </div>
      ) : null}
    </div>
  )
}
