"use client"

import { AlertTriangle, CheckCircle, Eye } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { type Notification, formatTimestamp, getSeverity } from "./notification-helpers"

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
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          System Notifications
        </CardTitle>
        <CardDescription>
          Important alerts and notifications that need your attention
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="text-center py-8">Loading notifications...</div>
        ) : notifications.length > 0 ? (
          notifications.map((notification) => (
            <Alert
              key={notification.id}
              variant={getSeverity(notification) === "high" ? "destructive" : "default"}
              className={`cursor-pointer transition-opacity ${notification.is_read ? "opacity-60" : ""}`}
              onClick={() => onOpenDetail(notification)}
            >
              <AlertTriangle className="h-4 w-4" />
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between w-full">
                <div className="space-y-1 flex-1">
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
                    <Badge
                      variant={getSeverity(notification) === "high" ? "destructive" : "default"}
                    >
                      {getSeverity(notification) === "high" ? "Critical" : "Low"}
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenDetail(notification)
                    }}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  {!notification.is_read && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation()
                        onMarkAsRead(notification.id)
                      }}
                    >
                      <CheckCircle className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </Alert>
          ))
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-600" />
            <p>No notifications at this time!</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
