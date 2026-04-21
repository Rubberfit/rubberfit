export type NotificationQueueType =
  | "low_stock"
  | "reorder_triggered"
  | "po_created"
  | "po_approved"
  | "delivery_expected"
  | "delivery_overdue"
  | "delivery_received"
  | "price_change"
  | "system_maintenance"
  | "critical_alert"

export type NotificationQueueStatus =
  | "pending"
  | "processing"
  | "sent"
  | "failed"
  | "cancelled"

export type NotificationQueuePriority = "low" | "normal" | "high" | "critical"

export interface NotificationQueue {
  id: string
  tenantId: string
  userId: string
  notificationType: NotificationQueueType
  title: string
  message: string
  sendEmail: boolean
  sendSms: boolean
  priority: NotificationQueuePriority
  scheduledFor: string
  status: NotificationQueueStatus
  emailSentAt: string | null
  emailDeliveredAt: string | null
  emailFailedAt: string | null
  emailErrorMessage: string | null
  smsSentAt: string | null
  smsDeliveredAt: string | null
  smsFailedAt: string | null
  smsErrorMessage: string | null
  retryCount: number
  maxRetries: number
  nextRetryAt: string | null
  contextData: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type CreateNotificationQueue = Omit<
  NotificationQueue,
  "id" | "createdAt" | "updatedAt"
>
export type UpdateNotificationQueue = Partial<CreateNotificationQueue>
