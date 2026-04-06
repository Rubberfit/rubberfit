"use client"

import { AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { toast } from "sonner"
import { globalEvents, EVENTS } from "@/lib/events"
import { type Notification, formatTimestamp } from "./notification-helpers"

interface NotificationDetailModalProps {
  notification: Notification | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NotificationDetailModal({
  notification,
  open,
  onOpenChange,
}: NotificationDetailModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{notification?.title}</DialogTitle>
          <DialogDescription>{formatTimestamp(notification?.created_at || "")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div>
            <Label>Description</Label>
            <p className="text-sm text-muted-foreground mt-1">{notification?.description}</p>
          </div>

          {notification?.type === "low_stock" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Current Stock</Label>
                  <p className="text-lg font-semibold">
                    {notification.current_value?.toFixed(1)} sqft
                  </p>
                </div>
                <div>
                  <Label>Minimum Threshold</Label>
                  <p className="text-lg font-semibold">
                    {notification.threshold_value?.toFixed(1)} sqft
                  </p>
                </div>
              </div>

              <div>
                <Label>Material Type</Label>
                <p className="text-sm text-muted-foreground mt-1">{notification.material_type}</p>
              </div>

              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Action Required</AlertTitle>
                <AlertDescription>
                  Consider placing an order for {notification.material_type} to maintain adequate
                  inventory levels.
                </AlertDescription>
              </Alert>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {notification?.type === "low_stock" && (
            <Button
              onClick={() => {
                onOpenChange(false)
                const suggestedLength = 240
                const suggestedWidth = 36
                const deficit =
                  (notification.threshold_value || 100) - (notification.current_value || 0)

                globalEvents.emit(EVENTS.OPEN_QUICK_CREATE, {
                  material_type: notification.material_type,
                  width: suggestedWidth.toString(),
                  length: suggestedLength.toString(),
                  thickness: "0.25",
                  notes: `Low stock order - Current: ${notification.current_value?.toFixed(1)} sqft, Need: ${deficit.toFixed(1)} sqft minimum`,
                })
                toast.success(
                  `Opening Quick Create for ${notification.material_type} with suggested values`
                )
              }}
            >
              Order Material
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
