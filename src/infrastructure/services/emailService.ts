import { Resend } from "resend"
// import { render } from '@react-email/render'; // TODO: Uncomment when email templates are ready
import { supabase, type NotificationQueue } from "@/lib/supabase"
import { getCurrentUserId } from "@/lib/getCurrentUserId"
// Email templates - some still need to be created
// import LowStockAlertEmail from '@/templates/email/low-stock-alert';
// import PriceChangeAlertEmail from '@/templates/email/price-change-alert';
// import POApprovalRequestEmail from '@/templates/email/po-approval-request';
// import POStatusUpdateEmail from '@/templates/email/po-status-update';
// import DailyDigestEmail from '@/templates/email/daily-digest';
// import WelcomeEmail from '@/templates/email/welcome';

// Initialize Resend client with API key from environment
const resend = new Resend(process.env.RESEND_API_KEY)

// Company details for branding
const COMPANY_NAME = "USI Manufacturing"
const FROM_EMAIL = process.env.SENDER_EMAIL || "notifications@usimanufacturing.com"
const REPLY_TO_EMAIL = process.env.REPLY_TO_EMAIL || "support@usimanufacturing.com"

interface EmailOptions {
  to: string | string[]
  subject: string
  html: string
  replyTo?: string
  tags?: { name: string; value: string }[]
}

interface QueuedEmail {
  id: string
  to: string
  subject: string
  html: string
  priority: "low" | "normal" | "high" | "critical"
  scheduledFor?: Date
  retryCount: number
  maxRetries: number
}

class EmailService {
  private emailQueue: QueuedEmail[] = []
  private isProcessing = false

  /**
   * Send an email immediately
   */
  async sendEmail(
    options: EmailOptions
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const { data, error } = await resend.emails.send({
        from: `${COMPANY_NAME} <${FROM_EMAIL}>`,
        to: Array.isArray(options.to) ? options.to : [options.to],
        subject: options.subject,
        html: options.html,
        replyTo: options.replyTo || REPLY_TO_EMAIL,
        tags: options.tags,
      })

      if (error) {
        console.error("Failed to send email:", error)
        return { success: false, error: error.message }
      }

      return { success: true, messageId: data?.id }
    } catch (error) {
      console.error("Email send error:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      }
    }
  }

  /**
   * Send a low stock alert email
   */
  async sendLowStockAlert(params: {
    to: string
    materialName: string
    currentStock: number
    reorderPoint: number
    supplier?: string
  }) {
    // TODO: Uncomment when email template is created
    const html = `<p>Low stock alert for ${params.materialName}</p>`
    /* const html = render(
      LowStockAlertEmail({
        materialName: params.materialName,
        currentStock: params.currentStock,
        reorderPoint: params.reorderPoint,
        supplier: params.supplier,
        companyName: COMPANY_NAME,
      })
    ); */

    return this.sendEmail({
      to: params.to,
      subject: `Low Stock Alert: ${params.materialName}`,
      html,
      tags: [
        { name: "notification_type", value: "low_stock" },
        { name: "material", value: params.materialName },
      ],
    })
  }

  /**
   * Send a price change alert email
   */
  async sendPriceChangeAlert(params: {
    to: string
    materialName: string
    supplier: string
    oldPrice: number
    newPrice: number
    changePercentage: number
    effectiveDate: Date
  }) {
    // TODO: Uncomment when email template is created
    const html = `<p>Price change alert for ${params.materialName}</p>`
    /* const html = render(
      PriceChangeAlertEmail({
        materialName: params.materialName,
        supplier: params.supplier,
        oldPrice: params.oldPrice,
        newPrice: params.newPrice,
        changePercentage: params.changePercentage,
        effectiveDate: params.effectiveDate,
        companyName: COMPANY_NAME,
      })
    ); */

    return this.sendEmail({
      to: params.to,
      subject: `Price Change Alert: ${params.materialName}`,
      html,
      tags: [
        { name: "notification_type", value: "price_change" },
        { name: "material", value: params.materialName },
        { name: "supplier", value: params.supplier },
      ],
    })
  }

  /**
   * Send a PO approval request email
   */
  async sendPOApprovalRequest(params: {
    to: string
    poNumber: string
    supplier: string
    totalAmount: number
    itemCount: number
    requestedBy: string
    approvalUrl: string
  }) {
    // TODO: Uncomment when email template is created
    const html = `<p>PO approval request for ${params.poNumber}</p>`
    /* const html = render(
      POApprovalRequestEmail({
        poNumber: params.poNumber,
        supplier: params.supplier,
        totalAmount: params.totalAmount,
        itemCount: params.itemCount,
        requestedBy: params.requestedBy,
        approvalUrl: params.approvalUrl,
        companyName: COMPANY_NAME,
      })
    ); */

    return this.sendEmail({
      to: params.to,
      subject: `PO Approval Required: ${params.poNumber}`,
      html,
      tags: [
        { name: "notification_type", value: "po_approval" },
        { name: "po_number", value: params.poNumber },
        { name: "supplier", value: params.supplier },
      ],
    })
  }

  /**
   * Send a PO status update email
   */
  async sendPOStatusUpdate(params: {
    to: string
    poNumber: string
    supplier: string
    oldStatus: string
    newStatus: string
    updatedBy?: string
    notes?: string
  }) {
    // TODO: Uncomment when email template is created
    const html = `<p>PO status update for ${params.poNumber}</p>`
    //     const html = render(
    //       POStatusUpdateEmail({
    //         poNumber: params.poNumber,
    //         supplier: params.supplier,
    //         oldStatus: params.oldStatus,
    //         newStatus: params.newStatus,
    //         updatedBy: params.updatedBy,
    //         notes: params.notes,
    //         companyName: COMPANY_NAME,
    //       })
    //     );

    return this.sendEmail({
      to: params.to,
      subject: `PO Status Update: ${params.poNumber}`,
      html,
      tags: [
        { name: "notification_type", value: "po_status" },
        { name: "po_number", value: params.poNumber },
        { name: "status", value: params.newStatus },
      ],
    })
  }

  /**
   * Send a daily digest email
   */
  async sendDailyDigest(params: {
    to: string
    date: Date
    lowStockItems: Array<{ material: string; stock: number; reorderPoint: number }>
    pendingPOs: Array<{ poNumber: string; supplier: string; amount: number }>
    recentCuts: number
    totalWaste: number
  }) {
    // TODO: Uncomment when email template is created
    const html = `<p>Daily digest for ${params.date.toLocaleDateString()}</p>`
    //     const html = render(
    //       DailyDigestEmail({
    //         date: params.date,
    //         lowStockItems: params.lowStockItems,
    //         pendingPOs: params.pendingPOs,
    //         recentCuts: params.recentCuts,
    //         totalWaste: params.totalWaste,
    //         companyName: COMPANY_NAME,
    //       })
    //    );

    return this.sendEmail({
      to: params.to,
      subject: `Daily Digest - ${params.date.toLocaleDateString()}`,
      html,
      tags: [
        { name: "notification_type", value: "daily_digest" },
        { name: "date", value: params.date.toISOString() },
      ],
    })
  }

  /**
   * Send a welcome email
   */
  async sendWelcomeEmail(params: { to: string; userName: string }) {
    // TODO: Uncomment when email template is created
    const html = `<p>Welcome ${params.userName}!</p>`
    //     const html = render(
    //       WelcomeEmail({
    //         userName: params.userName,
    //         companyName: COMPANY_NAME,
    //       })
    //    );

    return this.sendEmail({
      to: params.to,
      subject: `Welcome to ${COMPANY_NAME} Rema Portal`,
      html,
      tags: [{ name: "notification_type", value: "welcome" }],
    })
  }

  /**
   * Add email to queue for batch processing
   */
  async queueEmail(
    notification: Omit<
      NotificationQueue,
      "id" | "created_at" | "updated_at" | "retry_count" | "next_retry_at"
    >
  ): Promise<void> {
    const { data: _data, error } = await supabase
      .from("notification_queue")
      .insert({
        ...notification,
        retry_count: 0,
        max_retries: notification.max_retries || 3,
        status: "pending",
      })
      .select()
      .single()

    if (error) {
      console.error("Failed to queue notification:", error)
      throw error
    }
  }

  /**
   * Process email queue
   */
  async processEmailQueue(): Promise<void> {
    if (this.isProcessing) return

    this.isProcessing = true

    try {
      // Get pending emails from database
      const { data: pendingEmails, error } = await supabase
        .from("notification_queue")
        .select("*")
        .eq("status", "pending")
        .eq("send_email", true)
        .lte("scheduled_for", new Date().toISOString())
        .order("priority", { ascending: false })
        .order("scheduled_for", { ascending: true })
        .limit(10)

      if (error) {
        console.error("Failed to fetch pending emails:", error)
        return
      }

      if (!pendingEmails || pendingEmails.length === 0) {
        return
      }

      // Process each email
      for (const email of pendingEmails) {
        await this.processQueuedEmail(email)
      }
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Process a single queued email
   */
  private async processQueuedEmail(notification: NotificationQueue): Promise<void> {
    try {
      // Update status to processing
      await supabase
        .from("notification_queue")
        .update({ status: "processing" })
        .eq("id", notification.id)

      // Prepare email based on notification type
      let emailSent = false

      switch (notification.notification_type) {
        case "low_stock":
          if (notification.context_data) {
            const ctx = notification.context_data as Record<string, string | number>
            const result = await this.sendLowStockAlert({
              to: notification.user_identifier,
              materialName: ctx.materialName as string,
              currentStock: ctx.currentStock as number,
              reorderPoint: ctx.reorderPoint as number,
              supplier: ctx.supplier as string,
            })
            emailSent = result.success
          }
          break

        case "price_change":
          if (notification.context_data) {
            const ctx = notification.context_data as Record<string, string | number>
            const result = await this.sendPriceChangeAlert({
              to: notification.user_identifier,
              materialName: ctx.materialName as string,
              supplier: ctx.supplier as string,
              oldPrice: ctx.oldPrice as number,
              newPrice: ctx.newPrice as number,
              changePercentage: ctx.changePercentage as number,
              effectiveDate: new Date(ctx.effectiveDate as string),
            })
            emailSent = result.success
          }
          break

        case "po_created":
        case "po_approved":
          if (notification.context_data) {
            const ctx = notification.context_data as Record<string, string | undefined>
            const result = await this.sendPOStatusUpdate({
              to: notification.user_identifier,
              poNumber: ctx.poNumber as string,
              supplier: ctx.supplier as string,
              oldStatus: (ctx.oldStatus as string) || "draft",
              newStatus: ctx.newStatus as string,
              updatedBy: ctx.updatedBy,
              notes: ctx.notes,
            })
            emailSent = result.success
          }
          break

        default: {
          // Send generic notification email
          const result = await this.sendEmail({
            to: notification.user_identifier,
            subject: notification.title,
            html: `
              <div style="font-family: Arial, sans-serif; padding: 20px;">
                <h2>${notification.title}</h2>
                <p>${notification.message}</p>
                <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e5e5;">
                <p style="color: #666; font-size: 12px;">
                  This is an automated message from ${COMPANY_NAME} Rema Portal
                </p>
              </div>
            `,
          })
          emailSent = result.success
        }
      }

      // Update notification status
      if (emailSent) {
        await supabase
          .from("notification_queue")
          .update({
            status: "sent",
            email_sent_at: new Date().toISOString(),
            email_delivered_at: new Date().toISOString(),
          })
          .eq("id", notification.id)
      } else {
        // Handle retry logic
        const nextRetryCount = notification.retry_count + 1
        if (nextRetryCount < notification.max_retries) {
          const nextRetryAt = new Date()
          nextRetryAt.setMinutes(nextRetryAt.getMinutes() + Math.pow(2, nextRetryCount)) // Exponential backoff

          await supabase
            .from("notification_queue")
            .update({
              status: "pending",
              retry_count: nextRetryCount,
              next_retry_at: nextRetryAt.toISOString(),
            })
            .eq("id", notification.id)
        } else {
          await supabase
            .from("notification_queue")
            .update({
              status: "failed",
              email_failed_at: new Date().toISOString(),
              email_error_message: "Max retries exceeded",
            })
            .eq("id", notification.id)
        }
      }
    } catch (error) {
      console.error("Failed to process queued email:", error)

      // Mark as failed
      await supabase
        .from("notification_queue")
        .update({
          status: "failed",
          email_failed_at: new Date().toISOString(),
          email_error_message: error instanceof Error ? error.message : "Unknown error",
        })
        .eq("id", notification.id)
    }
  }

  /**
   * Send bulk emails with rate limiting
   */
  async sendBulkEmails(
    emails: Array<{
      to: string
      subject: string
      html: string
      priority?: "low" | "normal" | "high" | "critical"
    }>
  ): Promise<void> {
    const BATCH_SIZE = 10
    const DELAY_BETWEEN_BATCHES = 1000 // 1 second

    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const batch = emails.slice(i, i + BATCH_SIZE)

      const user_id = await getCurrentUserId()

      // Process batch in parallel
      await Promise.all(
        batch.map((email) =>
          this.queueEmail({
            user_id,
            user_identifier: email.to,
            notification_type: "system_maintenance",
            title: email.subject,
            message: "",
            send_email: true,
            send_sms: false,
            priority: email.priority || "normal",
            scheduled_for: new Date().toISOString(),
            status: "pending",
            context_data: { html: email.html },
            max_retries: 3,
          })
        )
      )

      // Delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < emails.length) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_BATCHES))
      }
    }
  }
}

// Export singleton instance
const emailService = new EmailService()
export default emailService

// Export types for use in other modules
export type { EmailOptions, QueuedEmail }
