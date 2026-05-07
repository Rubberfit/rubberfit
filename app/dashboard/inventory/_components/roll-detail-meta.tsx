"use client"

import { MapPin } from "lucide-react"

import type { Roll } from "@/src/infrastructure/models/supabase"

function formatDate(value: string | null | undefined): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString()
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value)
}

interface MetaRowProps {
  label: string
  value: React.ReactNode
}

function MetaRow({ label, value }: MetaRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border-subtle py-2 last:border-b-0">
      <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="text-right text-sm text-foreground">{value}</dd>
    </div>
  )
}

interface RollDetailMetaProps {
  roll: Roll
}

/**
 * Roll detail meta strip — Location / Supplier / Received /
 * Cost per sqft / Notes. Lifted out of the drawer body so the
 * parent stays under the `max-lines-per-function` budget.
 */
export function RollDetailMeta({ roll }: RollDetailMetaProps) {
  return (
    <section className="px-6 py-5">
      <div className="mb-2 flex items-center gap-2">
        <MapPin className="size-3.5 text-muted-foreground" aria-hidden="true" />
        <h3 className="font-medium text-xs uppercase tracking-[0.12em] text-foreground">Details</h3>
      </div>
      <dl className="divide-y divide-border-subtle">
        <MetaRow label="Location" value={roll.location ?? "—"} />
        <MetaRow label="Supplier" value={roll.supplier ?? "—"} />
        <MetaRow label="Received" value={formatDate(roll.date_received)} />
        <MetaRow label="Cost / sqft" value={formatCurrency(roll.cost_per_sqft)} />
        <MetaRow label="Notes" value={roll.notes ?? "—"} />
      </dl>
    </section>
  )
}
