"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"

interface NotificationPageHeaderProps {
  unreadCount: number
  onMarkAllAsRead: () => void
  onClearAll: () => void
}

export function NotificationPageHeader({
  unreadCount,
  onMarkAllAsRead,
  onClearAll,
}: NotificationPageHeaderProps) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="text-2xl font-bold">
          Notifications
          {unreadCount > 0 && (
            <Badge variant="destructive" className="ml-2">
              {unreadCount} unread
            </Badge>
          )}
        </h1>
        <p className="text-muted-foreground">
          Stay updated on inventory alerts and recent activities
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onMarkAllAsRead} disabled={unreadCount === 0}>
          Mark All as Read
        </Button>
        <Button
          onClick={onClearAll}
          variant="outline"
          size="sm"
          className="text-red-600 hover:text-red-700"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Clear All
        </Button>
      </div>
    </div>
  )
}
