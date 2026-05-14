import packageJson from "../package.json"

const currentYear = new Date().getFullYear()

export const APP_CONFIG = {
  name: "RubberFit",
  version: packageJson.version,
  copyright: `© ${currentYear}, Arc & Anchor.`,
  meta: {
    title: "RubberFit - CRM & 2D Nesting Engine for Rubber Manufacturing",
    description:
      "RubberFit is a CRM and 2D nesting engine for rubber manufacturing. Manage suppliers, procurement, inventory, and optimize material cuts to minimize waste.",
  },
  /**
   * Step 7c-2 follow-up: hourly cron monitors the safety-net views
   * (po_receipts_pending_apply, po_receipts_pending_roll_creation) and
   * pages admins when receipts pile up.
   *   • THRESHOLD_HOURS — minimum age before a row counts as "pending too
   *     long" and earns an alert. Keeps the alert noise low for normal
   *     race-window recoveries that resolve within minutes.
   *   • DEDUP_WINDOW_HOURS — don't re-alert the same admin within this
   *     window if the safety-net summary hasn't materially changed.
   */
  PO_RECEIPT_PENDING_ALERT_THRESHOLD_HOURS: 1,
  PO_RECEIPT_PENDING_ALERT_DEDUP_WINDOW_HOURS: 6,
}
