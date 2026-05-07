"use client"

import { AlertTriangle, CheckCircle, Eye } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/app/components/ui/alert"
import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import { cn } from "@/app/lib/utils"

import { formatTimestamp, getSeverity, type Notification } from "./notification-helpers"

interface NotificationListProps {
  notifications: Notification[]
  loading: boolean
  onOpenDetail: (notification: Notification) => void
  onMarkAsRead: (notificationId: string) => void
}

export function NotificationList({
  notifications,
  loading,
  onOpenDetail,
  onMarkAsRead,
}: NotificationListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-[color:var(--warning)]" aria-hidden="true" />
          System notifications
        </CardTitle>
        <CardDescription>
          Important alerts and notifications that need your attention.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Loading notifications…
          </div>
        ) : notifications.length > 0 ? (
          notifications.map((notification) => {
            const severity = getSeverity(notification)
            const isHigh = severity === "high"
            return (
              // `Alert` ships `role="alert"` (a live region), so it
              // must NOT be a click target — screen readers would
              // re-announce the entire card on every render and the
              // click area would lack keyboard semantics. The Eye
              // button below is the sole, keyboard-accessible
              // detail trigger.
              <Alert
                key={notification.id}
                variant={isHigh ? "destructive" : "default"}
                className={cn("transition-opacity", notification.is_read && "opacity-60")}
              >
                <AlertTriangle
                  className={cn(
                    "size-4",
                    isHigh ? "text-[color:var(--danger)]" : "text-[color:var(--warning)]"
                  )}
                  aria-hidden="true"
                />
                <div className="flex w-full flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div className="flex-1 space-y-1">
                    <AlertTitle className="flex items-center gap-2">
                      {notification.title}
                      {!notification.is_read && (
                        <Badge variant="destructive" className="text-xs">
                          New
                        </Badge>
                      )}
                    </AlertTitle>
                    <AlertDescription>{notification.description}</AlertDescription>
                    <p className="text-xs text-muted-foreground">
                      {formatTimestamp(notification.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {notification.type === "low_stock" && (
                      <Badge variant={isHigh ? "destructive" : "default"}>
                        {isHigh ? "Critical" : "Low"}
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="View details"
                      onClick={() => onOpenDetail(notification)}
                    >
                      <Eye className="size-4" />
                    </Button>
                    {!notification.is_read && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Mark as read"
                        onClick={() => onMarkAsRead(notification.id)}
                      >
                        <CheckCircle className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </Alert>
            )
          })
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            <CheckCircle
              className="mx-auto mb-2 size-12 text-[color:var(--success)]"
              aria-hidden="true"
            />
            <p>No notifications at this time.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
