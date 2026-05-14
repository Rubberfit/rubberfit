"use client"

import * as React from "react"

interface UpsellButtonProps {
  label: string
  requiredTier: "pro" | "max" | "enterprise"
  onClick: () => void
  size?: "sm" | "md"
  className?: string
}

export function UpsellButton({
  label,
  requiredTier,
  onClick,
  size = "md",
  className,
}: UpsellButtonProps) {
  const height = size === "sm" ? "h-8" : "h-9"
  const px = size === "sm" ? "px-2.5" : "px-3"
  const textSize = size === "sm" ? "text-xs" : "text-[13px]"

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex items-center justify-center border border-[var(--color-rule)] bg-[var(--color-surface-raised)] text-[var(--color-ink)] transition-colors duration-150 cursor-pointer hover:border-[var(--color-ink-soft)] active:translate-y-px",
        height,
        px,
        textSize,
        "font-[family-name:var(--font-sans)]",
        className || "",
      ].join(" ")}
    >
      <span>{label}</span>
      <LockIconInline className="ml-2" />
      <TierPill tier={requiredTier} className="ml-1.5" />
    </button>
  )
}

function LockIconInline({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`inline-block text-[var(--color-ink-faint)] ${className || ""}`}
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="10" rx="0" ry="0" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function TierPill({
  tier,
  className,
}: {
  tier: "pro" | "max" | "enterprise"
  className?: string
}) {
  const isEnterprise = tier === "enterprise"
  return (
    <span
      className={[
        "inline-flex items-center h-[18px] px-1.5 border font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.08em] rounded-[2px]",
        isEnterprise
          ? "border-[var(--color-blueprint)] text-[var(--color-blueprint)]"
          : "border-[var(--color-rule)] text-[var(--color-ink-faint)]",
        "bg-[var(--color-surface)]",
        className || "",
      ].join(" ")}
    >
      {tier === "enterprise" ? "ENT" : tier.toUpperCase()}
    </span>
  )
}
