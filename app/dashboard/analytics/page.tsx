import { redirect } from "next/navigation"

/**
 * `/dashboard/analytics` redirects to the first-available sub-tab
 * (Waste) so the parent URL resolves to a usable surface. A real
 * summary tab can land here later if operators need one.
 */
export default function AnalyticsIndex() {
  redirect("/dashboard/analytics/waste")
}
