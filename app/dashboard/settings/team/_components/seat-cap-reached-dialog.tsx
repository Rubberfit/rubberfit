"use client"

import { Button } from "@/app/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog"
import { IconCircle } from "@/app/components/billing/IconCircle"

interface SeatCapReachedDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  purchased: number
  used: number
  onAddSeat: () => void
}

export function SeatCapReachedDialog({
  open,
  onOpenChange,
  purchased,
  used,
  onAddSeat,
}: SeatCapReachedDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md text-center">
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
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M19 8v6" />
              <path d="M22 11h-6" />
            </svg>
          </IconCircle>
          <DialogHeader className="mt-4">
            <DialogTitle className="text-lg font-semibold text-foreground">
              Add a seat to invite more teammates.
            </DialogTitle>
          </DialogHeader>
          <p className="mt-2 text-sm text-muted-foreground">
            Your workspace currently has {purchased} seats and {used} are in use. Adding 1 seat
            increases your monthly cost.
          </p>
        </div>
        <DialogFooter className="mt-6 sm:justify-center">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Manage later
          </Button>
          <Button
            className="bg-[var(--accent-fg)] text-white hover:bg-[var(--accent-fg)]/90"
            onClick={onAddSeat}
          >
            Add seat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
