import type { NotificationPreferences, NotificationQueue } from "@/src/infrastructure/models/supabase"

export interface NotificationParams {
  userIdentifier: string
  type: NotificationQueue["notification_type"]
  title: string
  message: string
  priority?: NotificationQueue["priority"]
  contextData?: Record<string, unknown>
}

export interface LowStockAlertParams {
  userIdentifier: string
  materialName: string
  currentStock: number
  reorderPoint: number
  supplier?: string
}

export interface PriceChangeAlertParams {
  userIdentifier: string
  materialName: string
  supplier: string
  oldPrice: number
  newPrice: number
  changePercentage: number
  effectiveDate: Date
}

export interface POStatusUpdateParams {
  userIdentifier: string
  poNumber: string
  supplier: string
  oldStatus: string
  newStatus: string
  updatedBy?: string
}

export interface ReorderTriggeredParams {
  userIdentifier: string
  materialName: string
  reorderQuantity: number
  supplier: string
  poNumber?: string
}

export interface CriticalAlertParams {
  userIdentifier: string
  title: string
  message: string
  contextData?: Record<string, unknown>
}

export interface INotificationService {
  initialize(): Promise<void>
  getUserPreferences(userIdentifier: string): Promise<NotificationPreferences | null>
  sendNotification(params: NotificationParams): Promise<void>
  sendLowStockAlert(params: LowStockAlertParams): Promise<void>
  sendPriceChangeAlert(params: PriceChangeAlertParams): Promise<void>
  sendPOStatusUpdate(params: POStatusUpdateParams): Promise<void>
  sendReorderTriggered(params: ReorderTriggeredParams): Promise<void>
  sendCriticalAlert(params: CriticalAlertParams): Promise<void>
  updateUserPreferences(
    userIdentifier: string,
    preferences: Partial<NotificationPreferences>,
  ): Promise<void>
  sendTestEmail(userIdentifier: string, email: string): Promise<boolean>
}
