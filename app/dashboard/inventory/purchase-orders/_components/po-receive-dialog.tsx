"use client"

import { useCallback, useMemo, useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { toast } from "sonner"

import { receivePurchaseOrder } from "@/app/actions/purchase-orders"
import { Button } from "@/app/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog"
import type { PurchaseOrderWithDetails } from "@/src/infrastructure/models/supabase"

import { PoReceiveItemRow } from "./po-receive-item-row"
import { usePoReceiveForm } from "./use-po-receive-form"

interface PoReceiveDialogProps {
  po: PurchaseOrderWithDetails | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onReceived: () => void
}

/**
 * Task #84 — dedicated PO receive dialog. Replaces the row-dropdown's
 * "Receive goods" defaults-only flow with a per-item form that lets
 * operators choose partial quantities and supply optional rollData
 * (width, length, thickness, color, location, cost_per_sqft, notes,
 * date_received) before submission. Backed by the same
 * `receivePurchaseOrder` server action — idempotency + entity-typed
 * persistence land identically; only the UX changes.
 *
 * Layout rationale: `sm:max-w-[900px]` with a vertically scrollable
 * inner region. Wide enough to fit the 8-field rollData grid without
 * stacking, tall enough to hold the receivable items + already-
 * received section without forcing an overflow scroll on the page.
 */
export function PoReceiveDialog({ po, open, onOpenChange, onReceived }: PoReceiveDialogProps) {
  const {
    drafts,
    setDraft,
    setRollData,
    defaultAllToOutstanding,
    idempotencyKey,
    regenerateKey,
    totals,
    perItemErrors,
    validate,
    buildPayload,
    receivableItemIds,
    alreadyReceivedItemIds,
  } = usePoReceiveForm(po, open)

  const [submitting, setSubmitting] = useState(false)
  const [alreadyReceivedExpanded, setAlreadyReceivedExpanded] = useState(false)

  const validation = useMemo(() => validate(), [validate])
  const submitDisabled = submitting || !validation.ok || !po

  const handleSubmit = useCallback(async () => {
    if (!po) return
    const check = validate()
    if (!check.ok) {
      if (check.error) toast.error(check.error)
      return
    }
    setSubmitting(true)
    try {
      await receivePurchaseOrder({
        purchaseOrderId: po.id,
        idempotencyKey,
        items: buildPayload(),
      })
      toast.success(
        totals.receivingSqft > 0
          ? `Received ${totals.receivingSqft} sqft on PO #${po.po_number ?? po.id}`
          : `Receipt recorded for PO #${po.po_number ?? po.id}`
      )
      // 'After success' rule: regenerate so a subsequent same-mount
      // submit counts as a fresh attempt.
      regenerateKey()
      onReceived()
      onOpenChange(false)
    } catch (error) {
      const err = error as Error & { code?: string }
      console.error("[po-receive-dialog] receive failed:", error)
      if (err.code === "UNAUTHORIZED") {
        toast.error("Your session has expired. Sign in again to continue.")
      } else if (err.code === "FORBIDDEN") {
        toast.error("You don't have permission to receive purchase orders.")
      } else if (err.code === "AUTH_CONFIG") {
        toast.error("Server misconfiguration — contact your administrator.")
      } else if (err.code === "INVALID_STATE_TRANSITION") {
        toast.error("This purchase order can't be received from its current state.", {
          description: "Refresh the list and try again.",
        })
      } else if (err.message) {
        toast.error(err.message)
      } else {
        toast.error("Failed to receive purchase order. Please try again.")
      }
    } finally {
      setSubmitting(false)
    }
  }, [
    po,
    validate,
    idempotencyKey,
    buildPayload,
    totals.receivingSqft,
    regenerateKey,
    onReceived,
    onOpenChange,
  ])

  const handleCancel = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  const AlreadyExpandIcon = alreadyReceivedExpanded ? ChevronDown : ChevronRight

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto"
        data-testid="po-receive-dialog"
      >
        <DialogHeader>
          <DialogTitle>Receive PO #{po?.po_number ?? "—"}</DialogTitle>
          <DialogDescription>
            {po?.supplier?.name
              ? `Supplier: ${po.supplier.name}. Adjust quantities per item and (optionally) capture roll dimensions before submitting.`
              : "Adjust quantities per item and (optionally) capture roll dimensions before submitting."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div
            data-testid="po-receive-summary"
            className="grid grid-cols-3 gap-3 rounded-md border bg-muted/40 p-3 text-sm"
          >
            <SummaryStat label="Ordered" value={`${totals.orderedSqft} sqft`} />
            <SummaryStat label="Receiving now" value={`${totals.receivingSqft} sqft`} />
            <SummaryStat
              label="Remaining after"
              value={`${totals.remainingAfterSqft} sqft`}
              hint={
                totals.remainingAfterSqft > 0 && totals.receivingSqft > 0
                  ? "PO will stay in 'Partially received'."
                  : undefined
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Receivable items</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={defaultAllToOutstanding}
              disabled={receivableItemIds.length === 0 || submitting}
            >
              Default all to outstanding
            </Button>
          </div>

          <div className="space-y-3">
            {receivableItemIds.length === 0 ? (
              <p className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
                No outstanding items on this PO.
              </p>
            ) : (
              receivableItemIds.map((id) => {
                const d = drafts[id]
                if (!d) return null
                return (
                  <PoReceiveItemRow
                    key={id}
                    draft={d}
                    error={perItemErrors[id] ?? null}
                    onChange={setDraft}
                    onChangeRollData={setRollData}
                  />
                )
              })
            )}
          </div>

          {alreadyReceivedItemIds.length > 0 && (
            <div className="space-y-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAlreadyReceivedExpanded((v) => !v)}
                className="justify-start"
                data-testid="po-receive-already-received-toggle"
              >
                <AlreadyExpandIcon className="size-3.5" aria-hidden="true" />
                Already received ({alreadyReceivedItemIds.length})
              </Button>
              {alreadyReceivedExpanded && (
                <div
                  data-testid="po-receive-already-received"
                  className="space-y-2 rounded-md border bg-muted/30 p-3"
                >
                  {alreadyReceivedItemIds.map((id) => {
                    const d = drafts[id]
                    if (!d) return null
                    return (
                      <div
                        key={id}
                        className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground"
                      >
                        <span className="text-foreground">{d.materialName}</span>
                        <span className="tabular-nums">
                          {d.alreadyReceivedSqft} / {d.quantitySqft} sqft
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitDisabled}
            data-testid="po-receive-submit"
          >
            {submitting ? "Receiving…" : "Receive"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface SummaryStatProps {
  label: string
  value: string
  hint?: string
}
function SummaryStat({ label, value, hint }: SummaryStatProps) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-base font-semibold text-foreground tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
