"use client"

import { AlertTriangle, ChevronLeft, X } from "lucide-react"
import { toast } from "sonner"

import { EVENTS, globalEvents } from "@/app/lib/events"
import { Alert, AlertDescription, AlertTitle } from "@/app/components/ui/alert"
import { Button } from "@/app/components/ui/button"
import { Label } from "@/app/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/app/components/ui/sheet"

import { formatTimestamp, type Notification } from "./notification-helpers"

interface NotificationDetailSheetProps {
  notification: Notification | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Notification detail viewer — Phase 4 PR.
 *
 * Right-docked `<Sheet>` replacement for the previous centered
 * `NotificationDetailModal`. Width `sm:max-w-2xl` matches the
 * locked simple-form drawer pattern (PRs 3a–3j). Read-only with
 * an "Order material" CTA on low-stock notifications that opens
 * the global quick-create flow.
 */
export function NotificationDetailSheet({
  notification,
  open,
  onOpenChange,
}: NotificationDetailSheetProps) {
  const handleOrderMaterial = () => {
    if (!notification) return
    onOpenChange(false)
    const suggestedLength = 240
    const suggestedWidth = 36
    const deficit = (notification.threshold_value ?? 100) - (notification.current_value ?? 0)

    globalEvents.emit(EVENTS.OPEN_QUICK_CREATE, {
      material_type: notification.material_type,
      width: suggestedWidth.toString(),
      length: suggestedLength.toString(),
      thickness: "0.25",
      notes: `Low stock order — current: ${notification.current_value?.toFixed(1)} sqft, need: ${deficit.toFixed(1)} sqft minimum`,
    })
    toast.success(`Opening Quick Create for ${notification.material_type} with suggested values`)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:w-full sm:max-w-2xl">
        <SheetHeader className="flex flex-row items-center justify-between gap-4 border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              aria-label="Back"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div>
              <SheetTitle className="font-display text-base font-semibold tracking-tight">
                {notification?.title ?? "Notification"}
              </SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground">
                {formatTimestamp(notification?.created_at ?? "")}
              </SheetDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          <div className="space-y-2">
            <Label>Description</Label>
            <p className="text-sm text-muted-foreground">{notification?.description}</p>
          </div>

          {notification?.type === "low_stock" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Current stock</Label>
                  <p className="font-mono text-lg font-semibold tabular-nums">
                    {notification.current_value?.toFixed(1)} sqft
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Minimum threshold</Label>
                  <p className="font-mono text-lg font-semibold tabular-nums">
                    {notification.threshold_value?.toFixed(1)} sqft
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Material type</Label>
                <p className="text-sm text-muted-foreground">{notification.material_type}</p>
              </div>

              <Alert className="border-[color:var(--warning)]/40">
                <AlertTriangle className="size-4 text-[color:var(--warning)]" aria-hidden="true" />
                <AlertTitle>Action required</AlertTitle>
                <AlertDescription>
                  Consider placing an order for {notification.material_type} to maintain adequate
                  inventory levels.
                </AlertDescription>
              </Alert>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t bg-card px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {notification?.type === "low_stock" && (
            <Button onClick={handleOrderMaterial}>Order material</Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
