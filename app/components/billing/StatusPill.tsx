import * as React from "react"

interface StatusPillProps {
  status: "paid" | "failed" | "refunded" | "pending"
}

const STATUS_STYLES: Record<StatusPillProps["status"], string> = {
  paid: "border-[var(--color-blueprint)] text-[var(--color-blueprint)] bg-[rgba(43,102,194,0.06)]",
  failed: "border-[var(--color-signal)] text-[var(--color-signal)] bg-[rgba(238,90,36,0.06)]",
  refunded: "border-[var(--color-ink-faint)] text-[var(--color-ink-faint)] bg-transparent",
  pending: "border-[var(--color-tape)] text-[var(--color-tape)] bg-[rgba(246,201,69,0.08)]",
}

export function StatusPill({ status }: StatusPillProps) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-[2px] border px-[6px] py-[2px] font-[family-name:var(--font-mono)] text-[10px] uppercase ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  )
}
