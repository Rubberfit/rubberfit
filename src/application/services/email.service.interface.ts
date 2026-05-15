import type { NotificationQueue } from "@/src/infrastructure/models/supabase"

export interface EmailOptions {
  to: string | string[]
  subject: string
  html: string
  replyTo?: string
  tags?: { name: string; value: string }[]
}

export interface IEmailService {
  sendEmail(
    options: EmailOptions
  ): Promise<{ success: boolean; messageId?: string; error?: string }>
  sendLowStockAlert(params: {
    to: string
    materialName: string
    currentStock: number
    reorderPoint: number
    supplier?: string
  }): Promise<{ success: boolean; messageId?: string; error?: string }>
  sendPriceChangeAlert(params: {
    to: string
    materialName: string
    supplier: string
    oldPrice: number
    newPrice: number
    changePercentage: number
    effectiveDate: Date
  }): Promise<{ success: boolean; messageId?: string; error?: string }>
  sendPOApprovalRequest(params: {
    to: string
    poNumber: string
    supplier: string
    totalAmount: number
    itemCount: number
    requestedBy: string
    approvalUrl: string
  }): Promise<{ success: boolean; messageId?: string; error?: string }>
  sendPOStatusUpdate(params: {
    to: string
    poNumber: string
    supplier: string
    oldStatus: string
    newStatus: string
    updatedBy?: string
    notes?: string
  }): Promise<{ success: boolean; messageId?: string; error?: string }>
  sendDailyDigest(params: {
    to: string
    date: Date
    lowStockItems: Array<{ material: string; stock: number; reorderPoint: number }>
    pendingPOs: Array<{ poNumber: string; supplier: string; amount: number }>
    recentCuts: number
    totalWaste: number
  }): Promise<{ success: boolean; messageId?: string; error?: string }>
  sendWelcomeEmail(params: {
    to: string
    userName: string
  }): Promise<{ success: boolean; messageId?: string; error?: string }>
  sendInvitationEmail(params: {
    to: string
    organizationName: string
    role: "admin" | "member"
    inviterName: string | null
    inviteUrl: string
    /**
     * Pre-formatted expiry label (e.g. "May 22, 2026" / "22/05/2026").
     * The caller (invitation use-cases) formats this with the
     * operator's date prefs via `formatUserDate` per the 2026-05-14
     * operator-seeds-prints ruling so the email service stays a pure
     * transport — no DB reads, no locale logic.
     */
    expiresAtLabel: string
  }): Promise<{ success: boolean; messageId?: string; error?: string }>
  queueEmail(
    notification: Omit<
      NotificationQueue,
      "id" | "created_at" | "updated_at" | "retry_count" | "next_retry_at"
    >
  ): Promise<void>
  processEmailQueue(): Promise<void>
  sendBulkEmails(
    emails: Array<{
      to: string
      subject: string
      html: string
      priority?: "low" | "normal" | "high" | "critical"
    }>
  ): Promise<void>
}
