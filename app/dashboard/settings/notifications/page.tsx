"use client"

import { useState } from "react"
import Link from "next/link"
import { Mail, Bell, Package, AlertTriangle } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Label } from "@/app/components/ui/label"
import { Switch } from "@/app/components/ui/switch"
import { Button } from "@/app/components/ui/button"
import { toast } from "sonner"
import {
  InlineNotice,
  PageHeader,
  PageShell,
} from "@/app/components/patterns"

/**
 * Notification preferences — toggles that gate which events
 * trigger in-app / email dispatch. The feed of *delivered*
 * notifications still lives at `/dashboard/notifications`;
 * this surface is preferences only.
 *
 * Backend wiring to `notification_preferences` table is
 * deferred to S6 post-tech-debt pass. For now, the toggles
 * persist to local state + toast on save.
 */

interface NotificationPrefs {
  emailLowStock: boolean
  emailRollDepleted: boolean
  emailCutCompleted: boolean
  emailSystemAlerts: boolean
  inAppLowStock: boolean
  inAppRollDepleted: boolean
  inAppCutCompleted: boolean
  inAppSystemAlerts: boolean
  quietHoursEnabled: boolean
}

export default function NotificationSettingsPage() {
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    emailLowStock: true,
    emailRollDepleted: true,
    emailCutCompleted: false,
    emailSystemAlerts: true,
    inAppLowStock: true,
    inAppRollDepleted: true,
    inAppCutCompleted: true,
    inAppSystemAlerts: true,
    quietHoursEnabled: false,
  })

  const setPref = <K extends keyof NotificationPrefs>(key: K, value: NotificationPrefs[K]) => {
    setPrefs((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = () => {
    toast.success("Notification preferences saved")
  }

  return (
    <PageShell variant="form">
      <PageHeader
        crumbs={[
          { label: "Settings", href: "/dashboard/settings" },
          { label: "Notifications" },
        ]}
        title="Notification preferences"
        subtitle="Control which events trigger in-app feed items and email dispatch."
        actions={
          <Button size="sm" onClick={handleSave}>
            Save preferences
          </Button>
        }
      />

      <InlineNotice intent="info" title="Preferences-only surface">
        The delivered notifications feed lives at{" "}
        <Link href="/dashboard/notifications" className="underline underline-offset-2">
          /dashboard/notifications
        </Link>
        . Toggles below gate which events produce feed items + emails.
      </InlineNotice>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="size-4" />
            In-app feed
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <PrefToggle
            icon={<Package className="size-4" />}
            label="Low-stock alerts"
            description="Fire when a material dips below its minimum stock alert."
            checked={prefs.inAppLowStock}
            onChange={(v) => setPref("inAppLowStock", v)}
          />
          <PrefToggle
            icon={<AlertTriangle className="size-4" />}
            label="Roll depleted"
            description="Fire when a roll's remaining length reaches zero."
            checked={prefs.inAppRollDepleted}
            onChange={(v) => setPref("inAppRollDepleted", v)}
          />
          <PrefToggle
            label="Cut completed"
            description="Fire when a cut job is finalized and recorded."
            checked={prefs.inAppCutCompleted}
            onChange={(v) => setPref("inAppCutCompleted", v)}
          />
          <PrefToggle
            label="System alerts"
            description="Platform-level events, engine failures, and administrative notices."
            checked={prefs.inAppSystemAlerts}
            onChange={(v) => setPref("inAppSystemAlerts", v)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="size-4" />
            Email dispatch
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <PrefToggle
            label="Low-stock email"
            description="Queue an email when low-stock alerts fire."
            checked={prefs.emailLowStock}
            onChange={(v) => setPref("emailLowStock", v)}
          />
          <PrefToggle
            label="Roll-depleted email"
            description="Queue an email when a roll depletes."
            checked={prefs.emailRollDepleted}
            onChange={(v) => setPref("emailRollDepleted", v)}
          />
          <PrefToggle
            label="Cut-completion email"
            description="Queue an email on every completed cut (usually off — noisy)."
            checked={prefs.emailCutCompleted}
            onChange={(v) => setPref("emailCutCompleted", v)}
          />
          <PrefToggle
            label="System alert email"
            description="Queue an email for engine failures and critical system events."
            checked={prefs.emailSystemAlerts}
            onChange={(v) => setPref("emailSystemAlerts", v)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quiet hours</CardTitle>
        </CardHeader>
        <CardContent>
          <PrefToggle
            label="Enable quiet hours"
            description="Suppress non-critical emails outside business hours (07:00 – 19:00 in your timezone)."
            checked={prefs.quietHoursEnabled}
            onChange={(v) => setPref("quietHoursEnabled", v)}
          />
        </CardContent>
      </Card>
    </PageShell>
  )
}

function PrefToggle({
  icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon?: React.ReactNode
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-2">
        {icon && (
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            {icon}
          </span>
        )}
        <div className="space-y-0.5">
          <Label className="font-medium">{label}</Label>
          <p className="text-muted-foreground text-xs">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
