"use client"

import { useState, useEffect, useCallback } from "react"

import { toast } from "sonner"
import { notificationCrudService } from "@/src/infrastructure/services/notificationCrudService"
import { globalEvents, EVENTS } from "@/app/lib/events"
import { useRouter } from "next/navigation"
import { type Notification } from "./_components/notification-helpers"
import { NotificationList } from "./_components/notification-list"
import { ActivityFeed } from "./_components/activity-feed"
import { NotificationPageHeader } from "./_components/notification-page-header"
import { NotificationDetailModal } from "./_components/notification-detail-modal"
import { useRecentActivities } from "./_components/use-recent-activities"

export default function NotificationsPage() {
  const _router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null)
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const { activities, fetchRecentActivities } = useRecentActivities()

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

      const data = uniqueNotifications

      setNotifications(data || [])
      setUnreadCount(data?.filter((n) => !n.is_read).length || 0)
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
    fetchNotifications()
    fetchRecentActivities()
  }, [fetchNotifications, fetchRecentActivities])

  const markAsRead = async (notificationId: string) => {
    try {
      await notificationCrudService.markAsRead(notificationId)
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
      )
      const newCount = Math.max(0, unreadCount - 1)
      setUnreadCount(newCount)
      globalEvents.emit(EVENTS.NOTIFICATIONS_UPDATED, { unreadCount: newCount })
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
      setUnreadCount(0)
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
    setDetailModalOpen(true)
    if (!notification.is_read) {
      markAsRead(notification.id)
    }
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <NotificationPageHeader
        unreadCount={unreadCount}
        onMarkAllAsRead={markAllAsRead}
        onClearAll={clearAllNotifications}
      />
      <NotificationList
        notifications={notifications}
        loading={loading}
        onOpenDetail={openNotificationDetail}
        onMarkAsRead={markAsRead}
      />
      <ActivityFeed activities={activities} />
      <NotificationDetailModal
        notification={selectedNotification}
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
      />
    </div>
  )
}
