"use client"

import { Recycle } from "lucide-react"

import { Badge } from "@/app/components/ui/badge"
import type { Roll } from "@/src/infrastructure/models/supabase"
import { cn } from "@/app/lib/utils"

function statusTone(status: string | null | undefined): string {
  switch (status) {
    case "active":
      return "border-success-border bg-success-bg text-success-foreground"
    case "reserved":
      return "border-warning-border bg-warning-bg text-warning-foreground"
    case "depleted":
      return "border-danger-border bg-danger-bg text-danger-foreground"
    default:
      return ""
  }
}

interface RollDetailOffcutsProps {
  /** Child rolls spawned from the parent (`parent_roll_id` match). */
  offcuts: Roll[]
}

/**
 * Lists reusable offcuts that this roll has spawned. Section
 * collapses (returns null) when there are no children, so the
 * drawer body doesn't carry an empty header.
 */
export function RollDetailOffcuts({ offcuts }: RollDetailOffcutsProps) {
  if (offcuts.length === 0) return null

  return (
    <section className="border-b px-6 py-5">
      <div className="mb-3 flex items-center gap-2">
        <Recycle className="size-3.5 text-muted-foreground" aria-hidden="true" />
        <h3 className="font-medium text-xs uppercase tracking-[0.12em] text-foreground">
          Spawned offcuts
        </h3>
        <span className="font-mono text-[10px] text-muted-foreground">{offcuts.length}</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {offcuts.map((child) => (
          <li
            key={child.id}
            className="flex items-center justify-between gap-3 rounded-md border border-border-subtle bg-muted/30 px-3 py-2"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="font-mono text-[11px] text-foreground/90">
                {child.part_number ?? "—"}
              </span>
              <span className="truncate text-[11px] text-muted-foreground">
                {child.width}″ × {child.length}″
              </span>
            </div>
            <Badge
              variant="outline"
              className={cn("shrink-0 text-[10px] capitalize", statusTone(child.status))}
            >
              {child.status ?? "unknown"}
            </Badge>
          </li>
        ))}
      </ul>
    </section>
  )
}
