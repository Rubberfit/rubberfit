import { redirect } from "next/navigation"

/**
 * `/dashboard/settings` lands on the General tab. Each sub-tab
 * owns its own route (see `layout.tsx` for the tab strip).
 */
export default function SettingsIndex() {
  redirect("/dashboard/settings/general")
}
