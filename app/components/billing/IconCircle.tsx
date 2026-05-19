"use client"

import * as React from "react"

type IconCircleVariant = "lock" | "slot"

interface IconCircleProps {
  variant: IconCircleVariant
  size?: number
  stroke?: string
  children?: React.ReactNode
}

export function IconCircle({
  variant,
  size = 32,
  stroke = "var(--color-signal)",
  children,
}: IconCircleProps) {
  const iconSize = Math.round(size * 0.5)

  return (
    <div
      className="flex items-center justify-center rounded-full border border-[var(--color-signal)]/20 bg-white/40"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {variant === "lock" ? (
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          // `style` (not the bare `stroke` attribute) so a CSS custom
          // property like `var(--color-signal)` resolves correctly —
          // raw SVG attributes don't process CSS variables.
          style={{ stroke }}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      ) : (
        children
      )}
    </div>
  )
}
