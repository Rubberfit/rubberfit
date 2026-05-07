"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"

import { EVENTS, globalEvents } from "@/app/lib/events"
import { notificationCrudService } from "@/src/infrastructure/services/notificationCrudService"
import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import { PageHeader, PageShell } from "@/app/components/patterns"

import { ActivityFeed } from "./_components/activity-feed"
import { type Notification } from "./_components/notification-helpers"
import { NotificationDetailSheet } from "./_components/notification-detail-sheet"
import { NotificationList } from "./_components/notification-list"
import { useRecentActivities } from "./_components/use-recent-activities"

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null)
  const [detailSheetOpen, setDetailSheetOpen] = useState(false)
  const { activities, fetchRecentActivities } = useRecentActivities()

  // Derive `unreadCount` from `notifications` so the count is
  // always consistent with the source of truth. Storing it as
  // separate state caused a stale-closure off-by-one bug when
  // two markAsRead calls fired before re-render.
  const unreadCount = useMemo(() => notifications.filter((n) => !n.is_read).length, [notifications])

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true)

      const allNotifs = await notificationCrudService.getAll()

      const seen = new Set<string>()
      const toDelete: string[] = []
      const uniqueNotifications: Notification[] = []

      if (allNotifs) {
        for (const notif of allNotifs) {
          const key = `${notif.type}_${notif.material_type || "none"}`
          if (notif.type === "low_stock" && seen.has(key)) {
            toDelete.push(notif.id)
          } else {
            seen.add(key)
            uniqueNotifications.push(notif)
          }
        }

        if (toDelete.length > 0) {
          console.log(`Cleaning up ${toDelete.length} duplicate notifications`)
          await notificationCrudService.deleteByIds(toDelete)
        }
      }

      setNotifications(uniqueNotifications)
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      console.error("Error fetching notifications:", errMsg)
      if (!errMsg.includes("relation") && !errMsg.includes("does not exist")) {
        toast.error("Failed to load notifications")
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchNotifications()
    void fetchRecentActivities()
  }, [fetchNotifications, fetchRecentActivities])

  const markAsRead = async (notificationId: string) => {
    try {
      await notificationCrudService.markAsRead(notificationId)
      // Compute the new unread count from the updated array we
      // pass to setNotifications so the global event reflects the
      // post-update state — `unreadCount` from closure would be
      // stale if multiple markAsRead calls race.
      let nextCount = 0
      setNotifications((prev) => {
        const updated = prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
        nextCount = updated.filter((n) => !n.is_read).length
        return updated
      })
      globalEvents.emit(EVENTS.NOTIFICATIONS_UPDATED, { unreadCount: nextCount })
      toast.success("Notification marked as read")
    } catch (error) {
      console.error("Error marking as read:", error)
      toast.error("Failed to mark notification as read")
    }
  }

  const markAllAsRead = async () => {
    try {
      await notificationCrudService.markAllAsRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
      globalEvents.emit(EVENTS.NOTIFICATIONS_UPDATED, { unreadCount: 0 })
      toast.success("All notifications marked as read")
    } catch (error) {
      console.error("Error marking all as read:", error)
      toast.error("Failed to mark all as read")
    }
  }

  const clearAllNotifications = async () => {
    try {
      await notificationCrudService.deleteAll()
      await fetchNotifications()
      toast.success("All notifications cleared")
    } catch (error) {
      console.error("Error clearing notifications:", error)
      toast.error("Failed to clear notifications")
    }
  }

  const openNotificationDetail = (notification: Notification) => {
    setSelectedNotification(notification)
    setDetailSheetOpen(true)
    if (!notification.is_read) {
      void markAsRead(notification.id)
    }
  }

  return (
    <PageShell variant="overview">
      <PageHeader
        crumbs={[{ label: "Operations", href: "/dashboard" }, { label: "Notifications" }]}
        title="Notifications"
        subtitle="Inventory alerts and recent activity, prioritized by severity."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void markAllAsRead()}
              disabled={unreadCount === 0}
            >
              Mark all as read
              {unreadCount > 0 && (
                <Badge variant="destructive" className="ml-1.5">
                  {unreadCount}
                </Badge>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void clearAllNotifications()}
              className="text-[color:var(--danger)] hover:text-[color:var(--danger)]"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Clear all
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <NotificationList
            notifications={notifications}
            loading={loading}
            onOpenDetail={openNotificationDetail}
            onMarkAsRead={markAsRead}
          />
        </div>
        <div className="lg:col-span-1">
          <ActivityFeed activities={activities} />
        </div>
      </div>

      <NotificationDetailSheet
        notification={selectedNotification}
        open={detailSheetOpen}
        onOpenChange={setDetailSheetOpen}
      />
    </PageShell>
  )
}
