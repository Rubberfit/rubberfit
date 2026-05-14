"use client"

import * as React from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"

const EASE = [0.22, 1, 0.36, 1] as const

interface UpgradeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pathLabel: string
  headline: string
  body: string
  requiredTier: "pro" | "max" | "enterprise"
}

export function UpgradeModal({
  open,
  onOpenChange,
  pathLabel,
  headline,
  body,
  requiredTier,
}: UpgradeModalProps) {
  const dialogRef = React.useRef<HTMLDivElement>(null)
  // Remember which element opened the modal so we can return focus
  // to it on close — keyboard-only and screen-reader users expect
  // the prior context to be restored rather than landing at the
  // body root.
  const triggerRef = React.useRef<HTMLElement | null>(null)

  React.useEffect(() => {
    if (!open) return
    triggerRef.current = (document.activeElement as HTMLElement) ?? null
    // Defer focus until the dialog is actually mounted so the focus
    // call doesn't race the AnimatePresence enter animation.
    const focusTimer = window.setTimeout(() => {
      dialogRef.current?.focus()
    }, 0)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false)
    }
    window.addEventListener("keydown", onKey)
    return () => {
      window.clearTimeout(focusTimer)
      window.removeEventListener("keydown", onKey)
      triggerRef.current?.focus?.()
      triggerRef.current = null
    }
  }, [open, onOpenChange])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onPointerDown={() => onOpenChange(false)}
            className="fixed inset-0 z-50 bg-[rgba(20,23,27,0.65)]"
            aria-hidden="true"
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              ref={dialogRef}
              tabIndex={-1}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="relative w-[480px] max-w-[calc(100vw-32px)] border border-t-2 border-[var(--color-rule)] border-t-[var(--color-signal)] bg-[var(--color-surface-raised)] p-8 outline-none"
              role="dialog"
              aria-modal="true"
            >
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="absolute right-6 top-6 text-[var(--color-ink-faint)] transition-colors hover:text-[var(--color-ink)]"
                aria-label="Close"
              >
                <CloseIcon />
              </button>

              <div className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.22em] text-[var(--color-signal)]">
                {pathLabel}
              </div>

              <h2 className="mt-4 text-[20px] text-[var(--color-ink)]">
                {headline}
              </h2>

              <p className="mt-2 text-[14px] leading-[1.5] text-[var(--color-ink-soft)]">
                {body}
              </p>

              <div className="mt-6 flex flex-col gap-2">
                <Link
                  href="/dashboard/settings/billing"
                  className="inline-flex h-11 w-full items-center justify-center bg-[var(--color-signal)] font-[family-name:var(--font-mono)] text-[12px] uppercase tracking-[0.05em] text-[var(--color-canvas)] transition-colors duration-150 hover:bg-[var(--color-signal-deep)] active:translate-y-px"
                >
                  Upgrade to {requiredTier === "enterprise" ? "Enterprise" : requiredTier.charAt(0).toUpperCase() + requiredTier.slice(1)}
                </Link>

                <Link
                  href="/dashboard/settings/billing?intent=trial"
                  className="inline-flex h-11 w-full items-center justify-center border border-[var(--color-graphite)] font-[family-name:var(--font-mono)] text-[12px] uppercase tracking-[0.05em] text-[var(--color-graphite)] transition-colors duration-150 hover:bg-[var(--color-graphite)] hover:text-[var(--color-canvas)]"
                >
                  Start 14-day trial
                </Link>

                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="mx-auto mt-1 font-[family-name:var(--font-mono)] text-[12px] text-[var(--color-ink-faint)] transition-colors hover:text-[var(--color-ink)]"
                >
                  Maybe later
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}
