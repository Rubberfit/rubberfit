"use client"

import * as React from "react"
import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/app/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog"
import { IconCircle } from "@/app/components/billing/IconCircle"
import { updateSubscriptionSeatCount } from "@/app/actions/billing"

interface SeatBumpDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentCount: number
  used: number
  pricePerSeat: number
  currency: string
}

function formatPrice(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}

export function SeatBumpDialog({
  open,
  onOpenChange,
  currentCount,
  used,
  pricePerSeat,
  currency,
}: SeatBumpDialogProps) {
  const router = useRouter()
  const [newCount, setNewCount] = React.useState(currentCount)
  const [pending, startTransition] = useTransition()

  React.useEffect(() => {
    if (open) setNewCount(currentCount)
  }, [open, currentCount])

  const currentTotal = currentCount * pricePerSeat
  const newTotal = newCount * pricePerSeat

  function handleDecrement() {
    setNewCount((c) => Math.max(Math.max(used, 1), c - 1))
  }

  function handleIncrement() {
    setNewCount((c) => Math.min(500, c + 1))
  }

  function handleConfirm() {
    startTransition(async () => {
      const result = await updateSubscriptionSeatCount({ newSeatCount: newCount })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(`Seat count updated to ${result.newSeatCount}`)
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <div className="flex flex-col items-center">
          <IconCircle variant="slot" size={32} stroke="var(--accent-fg)">
            <svg
              width={20}
              height={20}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </IconCircle>
          <DialogHeader className="mt-4">
            <DialogTitle className="text-center text-lg font-semibold text-foreground">
              Confirm seat change.
            </DialogTitle>
          </DialogHeader>
        </div>
        <div className="mt-4 space-y-3">
          <p className="font-mono text-sm text-muted-foreground">
            Current: {currentCount} seats × {formatPrice(pricePerSeat, currency)}/mo ={" "}
            {formatPrice(currentTotal, currency)}/mo.
          </p>
          <p className="font-mono text-sm font-medium text-foreground">
            After change: {newCount} seats × {formatPrice(pricePerSeat, currency)}/mo ={" "}
            {formatPrice(newTotal, currency)}/mo.
          </p>
          <p className="text-xs text-muted-foreground">
            Proration for the rest of this period appears on your next invoice.
          </p>
        </div>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button
            variant="outline"
            className="h-10 w-10 rounded-md p-0"
            onClick={handleDecrement}
            disabled={newCount <= Math.max(used, 1)}
            title={
              newCount <= Math.max(used, 1)
                ? "Deactivate teammates first to go below this count."
                : undefined
            }
            aria-label="Decrease seat count"
          >
            -
          </Button>
          <span className="w-16 text-center font-mono text-lg font-medium text-foreground">
            {newCount}
          </span>
          <Button
            variant="outline"
            className="h-10 w-10 rounded-md p-0"
            onClick={handleIncrement}
            disabled={newCount >= 500}
            aria-label="Increase seat count"
          >
            +
          </Button>
        </div>
        <DialogFooter className="mt-6 sm:justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            className="bg-[var(--accent-fg)] text-white hover:bg-[var(--accent-fg)]/90"
            onClick={handleConfirm}
            disabled={pending || newCount === currentCount}
          >
            {pending ? "Confirming..." : "Confirm seat change."}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
