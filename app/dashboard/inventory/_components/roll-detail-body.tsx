"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Edit, ExternalLink, Package, Printer, Scissors } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import { SheetDescription, SheetHeader, SheetTitle } from "@/app/components/ui/sheet"
import { cn } from "@/app/lib/utils"

import type { Roll, RollReusableOffcutSummary } from "@/src/infrastructure/models/supabase"
import { rollService } from "@/src/infrastructure/services/rollService"
import { ensureStoredRollBarcode } from "@/src/infrastructure/services/rollBarcodeAssetService"
import { StockSheet } from "@/app/dashboard/cutting-engine/_components/stock-sheet"

import { RollDetailMeta } from "./roll-detail-meta"
import { RollDetailOffcuts } from "./roll-detail-offcuts"
import { RollDetailUsage } from "./roll-detail-usage"
import { useOrganizationPreferences } from "@/app/dashboard/_components/organization-preferences-provider"
import {
  formatDimensionsInches,
  getAreaUnitLabel,
  getDisplayAreaValue,
} from "@/src/application/preferences/user-unit-display"
import { downloadRollLabelPdf } from "./roll-label-pdf"

interface RollDetailBodyProps {
  roll: Roll
  onEdit?: (roll: Roll) => void
  canManageRolls: boolean
  onClose: () => void
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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value)
}

/**
 * Body of the roll detail drawer. Phase 3 PR 3b — keyed on
 * `roll.id` from the parent so a swap re-mounts the body and
 * runs a fresh fetch via `useState(() => null)` initial state +
 * the wrapped `fetchRollContext` callback (avoids React 19
 * `react-hooks/set-state-in-effect`).
 */
export function RollDetailBody({ roll, onEdit, canManageRolls, onClose }: RollDetailBodyProps) {
  const router = useRouter()
  const organizationPreferences = useOrganizationPreferences()
  const [usage, setUsage] = useState<RollReusableOffcutSummary | null>(null)
  const [offcuts, setOffcuts] = useState<Roll[]>([])

  const fetchRollContext = useCallback(async (rollId: string, signal: { isCancelled: boolean }) => {
    try {
      const [summary, children] = await Promise.all([
        rollService.getReusableOffcutSummary(rollId),
        rollService.getChildOffcutsRaw(rollId),
      ])
      if (signal.isCancelled) return
      setUsage(summary)
      setOffcuts(children)
    } catch (error) {
      // Leave prior state visible on transient failures so a
      // flaky fetch doesn't blank the drawer mid-read.
      console.error("[roll-detail-body] failed to fetch roll context:", error)
    }
  }, [])

  // The setState calls happen inside the async `fetchRollContext`
  // callback (after `await`), not synchronously in this effect
  // body — but the React 19 `set-state-in-effect` rule traces the
  // call chain conservatively. Disabling for this single effect;
  // the body remounts on `roll.id` change (parent keys it on the
  // roll), so there's no stale-closure risk to guard against.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const signal = { isCancelled: false }
    void fetchRollContext(roll.id, signal)
    return () => {
      signal.isCancelled = true
    }
  }, [fetchRollContext, roll.id])
  /* eslint-enable react-hooks/set-state-in-effect */

  const remainingPercent =
    roll.length > 0 ? Math.max(0, Math.min(100, (roll.remaining_length / roll.length) * 100)) : 0
  const remainingSqft = (roll.remaining_length * roll.width) / 144

  const handleOpenInEngine = () => {
    router.push(`/dashboard/cutting-engine?loadRoll=${roll.id}`)
    onClose()
  }

  const handleEdit = () => {
    onEdit?.(roll)
    onClose()
  }

  const handlePrintLabel = async () => {
    try {
      await ensureStoredRollBarcode(roll)
      downloadRollLabelPdf([roll], { organizationPreferences })
      toast.success("Label PDF downloaded")
    } catch (error) {
      const m = error instanceof Error ? error.message : "Unknown error"
      toast.error("Failed to build label", { description: m })
    }
  }

  return (
    <>
      <SheetHeader className="space-y-2 border-b px-6 pt-6 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <SheetTitle className="truncate font-semibold text-base tracking-tight">
                {roll.material_type}
              </SheetTitle>
              {roll.is_offcut && (
                <Badge
                  variant="outline"
                  className="shrink-0 gap-1 border-warning-border bg-warning-bg text-[10px] font-normal text-warning-foreground"
                >
                  Offcut
                </Badge>
              )}
            </div>
            <SheetDescription className="flex items-center gap-2 text-xs text-muted-foreground">
              {roll.part_number && (
                <span className="font-mono text-foreground/80">{roll.part_number}</span>
              )}
              {roll.part_number && <span className="text-border">·</span>}
              <span className="tabular-nums">
                {roll.color ? `${roll.color} · ` : ""}
                {formatDimensionsInches(
                  [roll.width, roll.length, roll.thickness],
                  organizationPreferences,
                  { precision: 3 }
                )}
              </span>
            </SheetDescription>
          </div>
          <Badge variant="outline" className={cn("shrink-0 capitalize", statusTone(roll.status))}>
            {roll.status ?? "unknown"}
          </Badge>
        </div>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto">
        <section className="border-b px-6 py-5">
          <div className="mb-3 flex items-center gap-2">
            <Package className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <h3 className="font-medium text-xs uppercase tracking-[0.12em] text-foreground">
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
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Remaining
              </p>
              <p className="mt-1 font-semibold text-sm text-foreground">
                {remainingPercent.toFixed(0)}%
              </p>
            </div>
            <div className="rounded-md border border-border-subtle bg-muted/30 p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Available
              </p>
              <p className="mt-1 font-semibold text-sm text-foreground tabular-nums">
                {getDisplayAreaValue(remainingSqft, organizationPreferences).toFixed(1)}{" "}
                <span className="font-normal text-[11px] text-muted-foreground">
                  {getAreaUnitLabel(organizationPreferences)}
                </span>
              </p>
            </div>
            <div className="rounded-md border border-border-subtle bg-muted/30 p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Value
              </p>
              <p className="mt-1 font-semibold text-sm text-foreground">
                {roll.cost_per_sqft != null
                  ? formatCurrency(remainingSqft * roll.cost_per_sqft)
                  : "—"}
              </p>
            </div>
          </div>
        </section>

        <RollDetailOffcuts offcuts={offcuts} />
        <RollDetailUsage usage={usage} />
        <RollDetailMeta roll={roll} />
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
    </>
  )
}
