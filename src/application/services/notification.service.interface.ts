import type {
  NotificationPreferences,
  NotificationQueue,
} from "@/src/infrastructure/models/supabase"

/**
 * `actorId` is the auth.uid of the caller — required so the service can
 * stamp `notification_queue.user_id` without falling back to the
 * deprecated `getCurrentUserId()` browser-singleton (which throws in
 * server-action runtimes and silently dropped queued sends across the
 * arc-147 migration). Daniel review on PR #177.
 */
export interface NotificationParams {
  actorId: string
  userIdentifier: string
  type: NotificationQueue["notification_type"]
  title: string
  message: string
  priority?: NotificationQueue["priority"]
  contextData?: Record<string, unknown>
  scheduledFor?: Date
}

export interface LowStockAlertParams {
  actorId: string
  userIdentifier: string
  materialName: string
  currentStock: number
  reorderPoint: number
  supplier?: string
}

export interface PriceChangeAlertParams {
  actorId: string
  userIdentifier: string
  materialName: string
  supplier: string
  oldPrice: number
  newPrice: number
  changePercentage: number
  effectiveDate: Date
}

export interface POStatusUpdateParams {
  actorId: string
  userIdentifier: string
  poNumber: string
  supplier: string
  oldStatus: string
  newStatus: string
  updatedBy?: string
}

export interface ReorderTriggeredParams {
  actorId: string
  userIdentifier: string
  materialName: string
  reorderQuantity: number
  supplier: string
  poNumber?: string
}

export interface CriticalAlertParams {
  actorId: string
  userIdentifier: string
  title: string
  message: string
  contextData?: Record<string, unknown>
}

export interface INotificationService {
  initialize(): Promise<void>
  getUserPreferences(userIdentifier: string): Promise<NotificationPreferences | null>
  sendNotification(params: NotificationParams): Promise<void>
  stopQueueProcessor(): void
  sendLowStockAlert(params: LowStockAlertParams): Promise<void>
  sendPriceChangeAlert(params: PriceChangeAlertParams): Promise<void>
  sendPOStatusUpdate(params: POStatusUpdateParams): Promise<void>
  sendReorderTriggered(params: ReorderTriggeredParams): Promise<void>
  sendCriticalAlert(params: CriticalAlertParams): Promise<void>
  updateUserPreferences(
    actorId: string,
    userIdentifier: string,
    preferences: Partial<NotificationPreferences>
  ): Promise<void>
  sendTestEmail(userIdentifier: string, email: string): Promise<boolean>
}
