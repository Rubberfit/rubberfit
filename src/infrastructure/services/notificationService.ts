import {
  supabase,
  type NotificationPreferences,
  type NotificationQueue,
} from "@/src/infrastructure/models/supabase"
import { getCurrentUserId } from "@/src/infrastructure/services/getCurrentUserId"
import { emailService } from "./emailService"
import { toast } from "sonner"
import type { INotificationService } from "@/src/application/services/notification.service.interface"
import type { IEmailService } from "@/src/application/services/email.service.interface"
import "reflect-metadata"
import { injectable, inject } from "tsyringe"
import { TOKENS } from "@/di/tokens"

type NotificationType = NotificationQueue["notification_type"]
type NotificationPriority = NotificationQueue["priority"]

interface NotificationChannel {
  inApp: boolean
  email: boolean
  sms: boolean
}

interface NotificationParams {
  userIdentifier: string
  type: NotificationType
  title: string
  message: string
  priority?: NotificationPriority
  contextData?: Record<string, unknown>
  scheduledFor?: Date
}

@injectable()
export class NotificationService implements INotificationService {
  private userPreferences: Map<string, NotificationPreferences> = new Map()
  private processingInterval: NodeJS.Timeout | null = null

  constructor(@inject(TOKENS.IEmailService) private readonly emailService: IEmailService) {}

  /**
   * Initialize the notification service
   */
  async initialize(): Promise<void> {
    // Load all user preferences
    await this.loadUserPreferences()

    // Start queue processor
    this.startQueueProcessor()
  }

  /**
   * Load user preferences from database
   */
  private async loadUserPreferences(): Promise<void> {
    try {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("active", true)

      if (error) {
        console.error("Failed to load notification preferences:", error)
        return
      }

      if (data) {
        data.forEach((pref) => {
          this.userPreferences.set(pref.user_identifier, pref)
        })
      }
    } catch (error) {
      console.error("Error loading preferences:", error)
    }
  }

  /**
   * Get user notification preferences
   */
  async getUserPreferences(userIdentifier: string): Promise<NotificationPreferences | null> {
    // Check cache first
    if (this.userPreferences.has(userIdentifier)) {
      return this.userPreferences.get(userIdentifier)!
    }

    // Load from database
    const { data, error } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_identifier", userIdentifier)
      .eq("active", true)
      .single()

    if (error || !data) {
      return null
    }

    // Cache the preferences
    this.userPreferences.set(userIdentifier, data)
    return data
  }

  /**
   * Check if a notification should be sent based on user preferences
   */
  private async shouldSendNotification(
    userIdentifier: string,
    type: NotificationType,
    channel: keyof NotificationChannel
  ): Promise<boolean> {
    const preferences = await this.getUserPreferences(userIdentifier)

    if (!preferences || !preferences.active) {
      return false
    }

    // Check if channel is enabled
    if (channel === "email" && !preferences.email_enabled) {
      return false
    }
    if (channel === "sms" && !preferences.sms_enabled) {
      return false
    }

    // Check notification type preferences
    switch (type) {
      case "low_stock":
        return preferences.low_stock_enabled
      case "reorder_triggered":
        return preferences.reorder_triggered_enabled
      case "po_created":
        return preferences.po_created_enabled
      case "po_approved":
        return preferences.po_approved_enabled
      case "delivery_expected":
        return preferences.delivery_expected_enabled
      case "delivery_overdue":
        return preferences.delivery_overdue_enabled
      case "delivery_received":
        return preferences.delivery_received_enabled
      case "price_change":
        return preferences.price_change_enabled
      case "system_maintenance":
        return preferences.system_maintenance_enabled
      case "critical_alert":
        return preferences.critical_alerts_enabled
      default:
        return true
    }
  }

  /**
   * Check if notification is within quiet hours
   */
  private isInQuietHours(preferences: NotificationPreferences): boolean {
    if (!preferences.quiet_hours_start || !preferences.quiet_hours_end) {
      return false
    }

    const now = new Date()
    const userTime = new Date(now.toLocaleString("en-US", { timeZone: preferences.timezone }))
    const currentHour = userTime.getHours()
    const currentMinute = userTime.getMinutes()
    const currentTime = currentHour * 60 + currentMinute

    const [startHour, startMinute] = preferences.quiet_hours_start.split(":").map(Number)
    const [endHour, endMinute] = preferences.quiet_hours_end.split(":").map(Number)
    const startTime = startHour * 60 + startMinute
    const endTime = endHour * 60 + endMinute

    if (startTime <= endTime) {
      return currentTime >= startTime && currentTime <= endTime
    } else {
      // Quiet hours span midnight
      return currentTime >= startTime || currentTime <= endTime
    }
  }

  /**
   * Send a notification through multiple channels
   */
  async sendNotification(params: NotificationParams): Promise<void> {
    const preferences = await this.getUserPreferences(params.userIdentifier)

    // Determine channels to use
    const channels: NotificationChannel = {
      inApp: true, // Always show in-app notifications
      email: false,
      sms: false,
    }

    if (preferences) {
      // Check if notification should be sent via email
      if (await this.shouldSendNotification(params.userIdentifier, params.type, "email")) {
        channels.email = !this.isInQuietHours(preferences) || params.priority === "critical"
      }

      // Check if notification should be sent via SMS
      if (await this.shouldSendNotification(params.userIdentifier, params.type, "sms")) {
        channels.sms = !this.isInQuietHours(preferences) || params.priority === "critical"
      }
    }

    // Send in-app notification
    if (channels.inApp) {
      this.showInAppNotification(params)
    }

    // Queue email/SMS notifications
    if (channels.email || channels.sms) {
      await this.queueNotification({
        ...params,
        sendEmail: channels.email,
        sendSms: channels.sms,
      })
    }
  }

  /**
   * Show in-app notification using toast
   */
  private showInAppNotification(params: NotificationParams): void {
    const toastOptions = {
      description: params.message,
      duration: params.priority === "critical" ? 10000 : 5000,
    }

    switch (params.priority) {
      case "critical":
      case "high":
        toast.error(params.title, toastOptions)
        break
      case "normal":
        toast.info(params.title, toastOptions)
        break
      case "low":
        toast.message(params.title, toastOptions)
        break
      default:
        toast(params.title, toastOptions)
    }
  }

  /**
   * Queue a notification for processing
   */
  private async queueNotification(
    params: NotificationParams & { sendEmail: boolean; sendSms: boolean }
  ): Promise<void> {
    try {
      const scheduledFor = params.scheduledFor || new Date()
      const user_id = await getCurrentUserId()

      await supabase.from("notification_queue").insert({
        user_id,
        user_identifier: params.userIdentifier,
        notification_type: params.type,
        title: params.title,
        message: params.message,
        send_email: params.sendEmail,
        send_sms: params.sendSms,
        priority: params.priority || "normal",
        scheduled_for: scheduledFor.toISOString(),
        status: "pending",
        context_data: params.contextData,
        retry_count: 0,
        max_retries: 3,
      })
    } catch (error) {
      console.error("Failed to queue notification:", error)
    }
  }

  /**
   * Start processing the notification queue
   */
  private startQueueProcessor(): void {
    // Process queue every 30 seconds
    this.processingInterval = setInterval(() => {
      this.processNotificationQueue()
    }, 30000)

    // Process immediately on start
    this.processNotificationQueue()
  }

  /**
   * Stop processing the notification queue
   */
  stopQueueProcessor(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval)
      this.processingInterval = null
    }
  }

  /**
   * Process pending notifications in the queue
   */
  private async processNotificationQueue(): Promise<void> {
    try {
      // Process email notifications
      await this.emailService.processEmailQueue()

      // TODO: Process SMS notifications when SMS service is implemented
    } catch (error) {
      console.error("Failed to process notification queue:", error)
    }
  }

  /**
   * Send notification for low stock alert
   */
  async sendLowStockAlert(params: {
    userIdentifier: string
    materialName: string
    currentStock: number
    reorderPoint: number
    supplier?: string
  }): Promise<void> {
    await this.sendNotification({
      userIdentifier: params.userIdentifier,
      type: "low_stock",
      title: `Low Stock Alert: ${params.materialName}`,
      message: `${params.materialName} stock (${params.currentStock} sq ft) is below reorder point (${params.reorderPoint} sq ft)`,
      priority: "high",
      contextData: params,
    })
  }

  /**
   * Send notification for price change
   */
  async sendPriceChangeAlert(params: {
    userIdentifier: string
    materialName: string
    supplier: string
    oldPrice: number
    newPrice: number
    changePercentage: number
    effectiveDate: Date
  }): Promise<void> {
    const preferences = await this.getUserPreferences(params.userIdentifier)

    // Check if change exceeds threshold
    if (preferences && Math.abs(params.changePercentage) < preferences.price_change_threshold) {
      return
    }

    await this.sendNotification({
      userIdentifier: params.userIdentifier,
      type: "price_change",
      title: `Price Change: ${params.materialName}`,
      message: `${params.supplier} changed price from $${params.oldPrice} to $${params.newPrice} (${params.changePercentage > 0 ? "+" : ""}${params.changePercentage.toFixed(1)}%)`,
      priority: Math.abs(params.changePercentage) > 20 ? "high" : "normal",
      contextData: params,
    })
  }

  /**
   * Send notification for PO status update
   */
  async sendPOStatusUpdate(params: {
    userIdentifier: string
    poNumber: string
    supplier: string
    oldStatus: string
    newStatus: string
    updatedBy?: string
  }): Promise<void> {
    let type: NotificationType = "po_created"
    let priority: NotificationPriority = "normal"

    if (params.newStatus === "approved") {
      type = "po_approved"
    } else if (params.newStatus === "received") {
      type = "delivery_received"
      priority = "low"
    } else if (params.newStatus === "ordered") {
      type = "delivery_expected"
    }

    await this.sendNotification({
      userIdentifier: params.userIdentifier,
      type,
      title: `PO ${params.poNumber} Status Update`,
      message: `Purchase order from ${params.supplier} changed from ${params.oldStatus} to ${params.newStatus}`,
      priority,
      contextData: params,
    })
  }

  /**
   * Send notification for reorder triggered
   */
  async sendReorderTriggered(params: {
    userIdentifier: string
    materialName: string
    reorderQuantity: number
    supplier: string
    poNumber?: string
  }): Promise<void> {
    await this.sendNotification({
      userIdentifier: params.userIdentifier,
      type: "reorder_triggered",
      title: "Auto-Reorder Triggered",
      message: `Reordering ${params.reorderQuantity} sq ft of ${params.materialName} from ${params.supplier}${params.poNumber ? ` (PO: ${params.poNumber})` : ""}`,
      priority: "normal",
      contextData: params,
    })
  }

  /**
   * Send critical system alert
   */
  async sendCriticalAlert(params: {
    userIdentifier: string
    title: string
    message: string
    contextData?: Record<string, unknown>
  }): Promise<void> {
    await this.sendNotification({
      userIdentifier: params.userIdentifier,
      type: "critical_alert",
      title: params.title,
      message: params.message,
      priority: "critical",
      contextData: params.contextData,
    })
  }

  /**
   * Update user notification preferences
   */
  async updateUserPreferences(
    userIdentifier: string,
    preferences: Partial<NotificationPreferences>
  ): Promise<void> {
    try {
      const user_id = await getCurrentUserId()
      const { data, error } = await supabase
        .from("notification_preferences")
        .upsert(
          {
            user_id,
            user_identifier: userIdentifier,
            ...preferences,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "user_identifier",
          }
        )
        .select()
        .single()

      if (error) {
        console.error("Failed to update preferences:", error)
        throw error
      }

      if (data) {
        // Update cache
        this.userPreferences.set(userIdentifier, data)
      }
    } catch (error) {
      console.error("Error updating preferences:", error)
      throw error
    }
  }

  /**
   * Send test email to verify configuration
   */
  async sendTestEmail(userIdentifier: string, email: string): Promise<boolean> {
    try {
      await this.emailService.sendWelcomeEmail({
        to: email,
        userName: userIdentifier,
      })

      toast.success("Test email sent successfully")
      return true
    } catch (error) {
      console.error("Failed to send test email:", error)
      toast.error("Failed to send test email")
      return false
    }
  }
}

// Export singleton instance
const notificationService = new NotificationService(emailService)
export default notificationService
export { notificationService }
