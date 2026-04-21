"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Edit, ExternalLink, MapPin, Package, Printer, Recycle, Scissors } from "lucide-react"

import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/app/components/ui/sheet"
import type {
  Roll,
  RollReusableOffcutSummary,
} from "@/src/infrastructure/models/supabase"
import { rollService } from "@/src/infrastructure/services/rollService"
import { cn } from "@/app/lib/utils"
import { toast } from "sonner"

import { StockSheet } from "@/app/dashboard/cutting-engine/_components/stock-sheet"

import { downloadRollLabelPdf } from "./roll-label-pdf"

/**
 * Right-docked detail panel for a single roll. Opens when a row
 * in the inventory table is clicked. Surfaces the sheet preview
 * (blank — no cut overlay), a compact dimension + metadata
 * summary, and the two most common next actions: edit this roll,
 * or open it in the cutting engine to start a new cut.
 *
 * The "Open in engine" action deep-links via `?loadRoll=<id>` —
 * mirrors the `?loadCut=<id>` pattern used from cut history.
 */

interface RollDetailDrawerProps {
  roll: Roll | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit?: (roll: Roll) => void
  canManageRolls?: boolean
}

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

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-border-subtle border-b py-2 last:border-b-0">
      <dt className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
        {label}
      </dt>
      <dd className="text-right text-foreground text-sm">{value}</dd>
    </div>
  )
}

export function RollDetailDrawer({
  roll,
  open,
  onOpenChange,
  onEdit,
  canManageRolls = false,
}: RollDetailDrawerProps) {
  const router = useRouter()
  // Usage summary + child offcuts spawned from this roll. Both
  // refresh on open + roll swap. We don't null them on close (the
  // drawer stays mounted) — stale state gets overwritten on the
  // next fetch when a roll is reopened.
  const [usage, setUsage] = useState<RollReusableOffcutSummary | null>(null)
  const [children, setChildren] = useState<Roll[]>([])

  useEffect(() => {
    if (!open || !roll) return
    let cancelled = false
    Promise.all([
      rollService.getReusableOffcutSummary(roll.id),
      rollService.getChildOffcuts(roll.id),
    ])
      .then(([summary, offcuts]) => {
        if (cancelled) return
        setUsage(summary)
        setChildren(offcuts)
      })
      .catch(() => {
        // Leave prior state visible on transient failures.
      })
    return () => {
      cancelled = true
    }
  }, [open, roll])

  if (!roll) return null

  const remainingPercent =
    roll.length > 0
      ? Math.max(0, Math.min(100, (roll.remaining_length / roll.length) * 100))
      : 0
  const remainingSqft = (roll.remaining_length * roll.width) / 144

  const handleOpenInEngine = () => {
    router.push(`/dashboard/cutting-engine?loadRoll=${roll.id}`)
    onOpenChange(false)
  }

  const handleEdit = () => {
    onEdit?.(roll)
    onOpenChange(false)
  }

  const handlePrintLabel = () => {
    try {
      downloadRollLabelPdf([roll])
      toast.success("Label PDF downloaded")
    } catch (err) {
      const m = err instanceof Error ? err.message : "Unknown error"
      toast.error("Failed to build label", { description: m })
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl sm:w-full flex flex-col gap-0 p-0">
        <SheetHeader className="border-b px-6 pt-6 pb-4 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <SheetTitle className="truncate font-semibold text-base tracking-tight">
                  {roll.material_type}
                </SheetTitle>
                {roll.is_offcut && (
                  <Badge
                    variant="outline"
                    className="shrink-0 gap-1 border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-foreground)] font-normal text-[10px]"
                  >
                    Offcut
                  </Badge>
                )}
              </div>
              <SheetDescription className="flex items-center gap-2 text-muted-foreground text-xs">
                {roll.part_number && (
                  <span className="font-mono text-foreground/80">{roll.part_number}</span>
                )}
                {roll.part_number && <span className="text-border">·</span>}
                <span>
                  {roll.color ? `${roll.color} · ` : ""}
                  {roll.width}&quot; × {roll.length}&quot; × {roll.thickness}&quot;
                </span>
              </SheetDescription>
            </div>
            <Badge
              variant="outline"
              className={cn("shrink-0 capitalize", statusTone(roll.status))}
            >
              {roll.status ?? "unknown"}
            </Badge>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <section className="border-b px-6 py-5">
            <div className="mb-3 flex items-center gap-2">
              <Package className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <h3 className="font-medium text-foreground text-xs uppercase tracking-[0.12em]">
                Sheet
              </h3>
            </div>
            <StockSheet
              width={roll.width}
              length={roll.length}
              remainingLength={roll.remaining_length}
              materialLabel={roll.material_type}
              usage={
                usage && usage.cut_count > 0
                  ? {
                      reusableSqft: usage.total_reusable_sqft,
                      scrapSqft: usage.total_scrap_sqft,
                      cutCount: usage.cut_count,
                    }
                  : null
              }
            />
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-md border border-border-subtle bg-muted/30 p-3">
                <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
                  Remaining
                </p>
                <p className="mt-1 font-semibold text-foreground text-sm">
                  {remainingPercent.toFixed(0)}%
                </p>
              </div>
              <div className="rounded-md border border-border-subtle bg-muted/30 p-3">
                <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
                  Available
                </p>
                <p className="mt-1 font-semibold text-foreground text-sm">
                  {remainingSqft.toFixed(1)}{" "}
                  <span className="font-normal text-muted-foreground text-[11px]">
                    sqft
                  </span>
                </p>
              </div>
              <div className="rounded-md border border-border-subtle bg-muted/30 p-3">
                <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
                  Value
                </p>
                <p className="mt-1 font-semibold text-foreground text-sm">
                  {roll.cost_per_sqft
                    ? formatCurrency(remainingSqft * roll.cost_per_sqft)
                    : "—"}
                </p>
              </div>
            </div>
          </section>

          {children.length > 0 && (
            <section className="border-b px-6 py-5">
              <div className="mb-3 flex items-center gap-2">
                <Recycle className="size-3.5 text-muted-foreground" aria-hidden="true" />
                <h3 className="font-medium text-foreground text-xs uppercase tracking-[0.12em]">
                  Spawned offcuts
                </h3>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {children.length}
                </span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {children.map((child) => (
                  <li
                    key={child.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border-subtle bg-muted/30 px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="font-mono text-[11px] text-foreground/90">
                        {child.part_number ?? "—"}
                      </span>
                      <span className="truncate text-muted-foreground text-[11px]">
                        {child.width}″ × {child.length}″
                      </span>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn("shrink-0 capitalize text-[10px]", statusTone(child.status))}
                    >
                      {child.status ?? "unknown"}
                    </Badge>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {usage && usage.cut_count > 0 && (
            <section className="border-b px-6 py-5">
              <div className="mb-3 flex items-center gap-2">
                <Recycle className="size-3.5 text-muted-foreground" aria-hidden="true" />
                <h3 className="font-medium text-foreground text-xs uppercase tracking-[0.12em]">
                  Usage history
                </h3>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-md border border-border-subtle bg-muted/30 p-3">
                  <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
                    Reusable offcut
                  </p>
                  <p className="mt-1 font-semibold text-foreground text-sm">
                    {usage.total_reusable_sqft.toFixed(1)}{" "}
                    <span className="font-normal text-muted-foreground text-[11px]">sqft</span>
                  </p>
                </div>
                <div className="rounded-md border border-border-subtle bg-muted/30 p-3">
                  <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
                    Scrap
                  </p>
                  <p className="mt-1 font-semibold text-foreground text-sm">
                    {usage.total_scrap_sqft.toFixed(1)}{" "}
                    <span className="font-normal text-muted-foreground text-[11px]">sqft</span>
                  </p>
                </div>
                <div className="rounded-md border border-border-subtle bg-muted/30 p-3">
                  <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
                    Cuts
                  </p>
                  <p className="mt-1 font-semibold text-foreground text-sm">
                    {usage.cut_count}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-muted-foreground text-[11px]">
                Totals aggregated from cuts made against this roll. Legacy cuts that predate roll
                linking aren't included.
              </p>
            </section>
          )}

          <section className="px-6 py-5">
            <div className="mb-2 flex items-center gap-2">
              <MapPin className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <h3 className="font-medium text-foreground text-xs uppercase tracking-[0.12em]">
                Details
              </h3>
            </div>
            <dl className="divide-y divide-border-subtle">
              <MetaRow
                label="Location"
                value={roll.location ?? "—"}
              />
              <MetaRow label="Supplier" value={roll.supplier ?? "—"} />
              <MetaRow
                label="Received"
                value={formatDate(roll.date_received)}
              />
              <MetaRow
                label="Cost / sqft"
                value={formatCurrency(roll.cost_per_sqft)}
              />
              <MetaRow label="Notes" value={roll.notes ?? "—"} />
            </dl>
          </section>
        </div>

        <div className="border-t bg-card px-6 py-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="default"
              className="flex-1"
              onClick={handleOpenInEngine}
              disabled={roll.status !== "active"}
            >
              <Scissors className="size-3.5" aria-hidden="true" />
              Open in engine
              <ExternalLink className="size-3 text-primary-foreground/70" aria-hidden="true" />
            </Button>
            <Button variant="outline" onClick={handlePrintLabel}>
              <Printer className="size-3.5" aria-hidden="true" />
              Print label
            </Button>
            {canManageRolls && (
              <Button variant="outline" onClick={handleEdit}>
                <Edit className="size-3.5" aria-hidden="true" />
                Edit roll
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
