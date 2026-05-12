"use client"

import * as React from "react"
import Link from "next/link"

interface LockScreenProps {
  children: React.ReactNode
  hideSidebar?: boolean
}

export function LockScreen({ children, hideSidebar }: LockScreenProps) {
  return (
    <div
      data-hide-sidebar={hideSidebar ? "true" : undefined}
      className="relative flex min-h-screen flex-col bg-[var(--background)] font-[family-name:var(--font-sans)] text-[var(--color-graphite)]"
    >
      <header className="flex items-center justify-between px-6 py-5 md:px-10">
        <Link href="/" className="flex items-center gap-3" aria-label="Rubberfit home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/rubberfit-mark.svg" alt="" width={32} height={32} aria-hidden="true" />
          <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.22em] text-[var(--color-ink-soft)]">
            Rubberfit
          </span>
        </Link>
        <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.22em] text-[var(--color-ink-soft)]">
          Rev · 2026.05
        </span>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-24 pt-8 md:pt-16">
        {children}
      </main>
    </div>
  )
}
