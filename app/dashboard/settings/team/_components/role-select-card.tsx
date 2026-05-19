"use client"

import { cn } from "@/app/lib/utils"

interface RoleSelectCardProps {
  role: "admin" | "member"
  title: string
  description: string
  selected: boolean
  onSelect: () => void
}

export function RoleSelectCard({ title, description, selected, onSelect }: RoleSelectCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={title}
      onClick={onSelect}
      className={cn(
        "rounded-xl border p-4 text-left transition-colors",
        selected
          ? "border-[var(--accent-fg)] bg-[var(--accent)] ring-2 ring-[var(--accent-fg)]"
          : "border-border-subtle bg-white hover:border-[var(--accent-fg)]/50"
      )}
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </button>
  )
}
