import { render } from "@react-email/render"
import { injectable } from "tsyringe"
import "reflect-metadata"
import { makeAdminClient } from "@/src/infrastructure/supabase/server-clients"
import { emailService } from "@/src/infrastructure/services/emailService"
import { HealthAlertEmail } from "@/app/admin/_email-templates/health-alert-email"
import type {
  AlertFireInput,
  IHealthAlertService,
} from "@/src/application/services/health-alert.service.interface"

@injectable()
export class HealthAlertService implements IHealthAlertService {
  async maybeFire(input: AlertFireInput): Promise<void> {
    const adminClient = makeAdminClient()
    if (!adminClient) return

    // Deduplication: skip if an open alert already exists for this service
    const { data: existing } = await adminClient.rpc("get_open_alert_for_service", {
      p_service_name: input.serviceName,
    })
    if (existing && (existing as unknown[]).length > 0) return

    // Persist alert row
    await adminClient.schema("admin").from("alerts").insert({
      source_table: "health_checks",
      service_name: input.serviceName,
      severity: input.status === "down" ? "high" : "medium",
      title: `${input.serviceName} is ${input.status}`,
      message: input.detail,
      status: "active",
      triggered_at: input.checkedAt,
    })

    const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/admin/health`

    // Email alert
    const recipientEnv = process.env.ADMIN_ALERT_EMAIL
    if (recipientEnv) {
      const recipients = recipientEnv
        .split(",")
        .map(e => e.trim())
        .filter(Boolean)

      if (recipients.length > 0) {
        try {
          const html = await render(
            HealthAlertEmail({
              serviceName: input.serviceName,
              status: input.status,
              detail: input.detail,
              responseMs: input.responseMs,
              checkedAt: input.checkedAt,
              dashboardUrl,
            })
          )
          await emailService.sendEmail({
            to: recipients,
            subject: `[ALERT] ${input.serviceName} is ${input.status} — rema-portal`,
            html,
            tags: [
              { name: "category", value: "health-alert" },
              { name: "service", value: input.serviceName },
            ],
          })
        } catch (_error) {
          // Email failure must not abort the alert flow
        }
      }
    }

    // Slack webhook (fire and forget)
    const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL
    if (slackWebhookUrl) {
      try {
        const emoji = input.status === "down" ? ":red_circle:" : ":warning:"
        const formattedTime = new Date(input.checkedAt).toLocaleString("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "UTC",
        })
        const payload = {
          text: `${emoji} ${input.serviceName} is ${input.status}`,
          blocks: [
            {
              type: "header",
              text: {
                type: "plain_text",
                text: `${emoji} ${input.serviceName} is ${input.status === "down" ? "Down" : "Degraded"}`,
              },
            },
            {
              type: "section",
              fields: [
                { type: "mrkdwn", text: `*Service:*\n${input.serviceName}` },
                {
                  type: "mrkdwn",
                  text: `*Status:*\n${input.status === "down" ? "Down" : "Degraded"}`,
                },
                { type: "mrkdwn", text: `*Detail:*\n${input.detail}` },
                {
                  type: "mrkdwn",
                  text: `*Response Time:*\n${input.responseMs !== null ? `${input.responseMs}ms` : "N/A"}`,
                },
                { type: "mrkdwn", text: `*Detected At:*\n${formattedTime} UTC` },
              ],
            },
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: { type: "plain_text", text: "View Dashboard" },
                  url: dashboardUrl,
                },
              ],
            },
          ],
        }
        await fetch(slackWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(5000),
        })
      } catch (_error) {
        // Slack failure must not throw
      }
    }
  }
}

export const healthAlertService = new HealthAlertService()
export default healthAlertService
