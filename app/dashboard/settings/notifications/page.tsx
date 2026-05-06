"use client"

import { useCallback, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"

import { Input } from "@/app/components/ui/input"
import { Switch } from "@/app/components/ui/switch"
import {
  FormActions,
  FormField,
  FormFieldGroup,
  FormFieldset,
  FormSectionHeader,
} from "@/app/components/ui/forms"
import { InlineNotice, PageHeader, PageShell } from "@/app/components/patterns"

/**
 * Notification preferences — Phase 2 PR 3.
 *
 * Three sections per the locked spec §4:
 *   1. Thresholds — low-stock threshold (sq ft).
 *   2. Channels — Email / In-app / Push / SMS switches. Push and
 *      SMS render disabled with a "Coming soon" helper because the
 *      backend dispatcher only supports email + in-app today.
 *   3. Quiet hours — enabled switch + start/end + tz read-only.
 *
 * State is local-only; backend wiring to `notification_preferences`
 * is deferred to S6 tech-debt pass. The delivered notifications
 * feed lives at `/dashboard/notifications` (operator inbox); this
 * surface is preferences only.
 *
 * See `docs/superpowers/specs/2026-05-06-dashboard-phase2-design.md` §4.
 */

interface ThresholdsState {
  lowStockThreshold: string
}

interface ChannelsState {
  inApp: boolean
  email: boolean
  push: boolean
  sms: boolean
}

interface QuietHoursState {
  enabled: boolean
  startTime: string
  endTime: string
}

const THRESHOLD_DEFAULTS: ThresholdsState = {
  lowStockThreshold: "100",
}

const CHANNEL_DEFAULTS: ChannelsState = {
  inApp: true,
  email: true,
  push: false,
  sms: false,
}

const QUIET_DEFAULTS: QuietHoursState = {
  enabled: false,
  startTime: "19:00",
  endTime: "07:00",
}

export default function NotificationSettingsPage() {
  return (
    <PageShell variant="form">
      <PageHeader
        crumbs={[{ label: "Settings", href: "/dashboard/settings" }, { label: "Notifications" }]}
        title="Notifications"
        subtitle="Control which events trigger feed items and email dispatch."
      />

      <div className="mx-auto w-full max-w-2xl space-y-10 pb-20">
        <InlineNotice intent="info" title="Preferences-only surface">
          The delivered notifications feed lives at{" "}
          <Link href="/dashboard/notifications" className="underline underline-offset-2">
            /dashboard/notifications
          </Link>
          . Toggles below gate which events produce feed items + emails.
        </InlineNotice>

        <ThresholdsSection isFirst />
        <ChannelsSection />
        <QuietHoursSection />
      </div>
    </PageShell>
  )
}

function ThresholdsSection({ isFirst }: { isFirst?: boolean }) {
  const [baseline, setBaseline] = useState<ThresholdsState>(THRESHOLD_DEFAULTS)
  const [draft, setDraft] = useState<ThresholdsState>(THRESHOLD_DEFAULTS)

  const isDirty = draft.lowStockThreshold !== baseline.lowStockThreshold

  const handleSave = useCallback(() => {
    setBaseline(draft)
    toast.success("Thresholds saved")
  }, [draft])

  const handleCancel = useCallback(() => {
    setDraft(baseline)
  }, [baseline])

  return (
    <FormFieldset isFirst={isFirst}>
      <FormSectionHeader
        eyebrow="Thresholds"
        title="Stock alerts"
        description="Sets when low-stock alerts fire across the workspace. Per-material overrides live on the Materials tab."
      />
      <div className="mt-6 space-y-5">
        <FormFieldGroup>
          <FormField
            label="Low-stock threshold"
            htmlFor="low-stock-threshold"
            helperText="Alert fires when a material drops below this level (sq ft)."
            required
          >
            <Input
              id="low-stock-threshold"
              type="number"
              inputMode="numeric"
              min="0"
              step="10"
              value={draft.lowStockThreshold}
              onChange={(event) => setDraft({ lowStockThreshold: event.target.value })}
            />
          </FormField>
        </FormFieldGroup>
        <FormActions saveDisabled={!isDirty} onSave={handleSave} onCancel={handleCancel} />
      </div>
    </FormFieldset>
  )
}

function ChannelsSection() {
  const [baseline, setBaseline] = useState<ChannelsState>(CHANNEL_DEFAULTS)
  const [draft, setDraft] = useState<ChannelsState>(CHANNEL_DEFAULTS)

  const isDirty =
    draft.inApp !== baseline.inApp ||
    draft.email !== baseline.email ||
    draft.push !== baseline.push ||
    draft.sms !== baseline.sms

  const handleSave = useCallback(() => {
    setBaseline(draft)
    toast.success("Channel preferences saved")
  }, [draft])

  const handleCancel = useCallback(() => {
    setDraft(baseline)
  }, [baseline])

  return (
    <FormFieldset>
      <FormSectionHeader
        eyebrow="Channels"
        title="Where notifications dispatch"
        description="Pick which channels deliver notifications. SMS and Push are coming soon — the dispatcher only supports email and the in-app feed today."
      />
      <div className="mt-6">
        <div className="space-y-1">
          <ChannelRow
            label="In-app feed"
            description="Items appear in /dashboard/notifications."
            checked={draft.inApp}
            onChange={(value) => setDraft((prev) => ({ ...prev, inApp: value }))}
          />
          <ChannelRow
            label="Email"
            description="Queued via the email dispatcher with quiet-hours respected."
            checked={draft.email}
            onChange={(value) => setDraft((prev) => ({ ...prev, email: value }))}
          />
          <ChannelRow
            label="Push"
            description="Coming soon — desktop and mobile push are not yet wired."
            checked={draft.push}
            onChange={(value) => setDraft((prev) => ({ ...prev, push: value }))}
            disabled
            comingSoon
          />
          <ChannelRow
            label="SMS"
            description="Coming soon — text dispatch awaits a Twilio integration."
            checked={draft.sms}
            onChange={(value) => setDraft((prev) => ({ ...prev, sms: value }))}
            disabled
            comingSoon
          />
        </div>
        <FormActions saveDisabled={!isDirty} onSave={handleSave} onCancel={handleCancel} />
      </div>
    </FormFieldset>
  )
}

function QuietHoursSection() {
  const [baseline, setBaseline] = useState<QuietHoursState>(QUIET_DEFAULTS)
  const [draft, setDraft] = useState<QuietHoursState>(QUIET_DEFAULTS)

  const isDirty =
    draft.enabled !== baseline.enabled ||
    draft.startTime !== baseline.startTime ||
    draft.endTime !== baseline.endTime

  const handleSave = useCallback(() => {
    setBaseline(draft)
    toast.success("Quiet hours saved")
  }, [draft])

  const handleCancel = useCallback(() => {
    setDraft(baseline)
  }, [baseline])

  return (
    <FormFieldset>
      <FormSectionHeader
        eyebrow="Quiet hours"
        title="Suppress non-critical notifications"
        description="When enabled, email and push delivery skip the listed window. In-app feed items still post — the operator can read them at any time."
      />
      <div className="mt-6 space-y-5">
        <ChannelRow
          label="Enable quiet hours"
          description="Suppress non-critical emails outside the listed window."
          checked={draft.enabled}
          onChange={(value) => setDraft((prev) => ({ ...prev, enabled: value }))}
        />
        <FormFieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Start time" htmlFor="quiet-start">
              <Input
                id="quiet-start"
                type="time"
                value={draft.startTime}
                disabled={!draft.enabled}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, startTime: event.target.value }))
                }
              />
            </FormField>
            <FormField label="End time" htmlFor="quiet-end">
              <Input
                id="quiet-end"
                type="time"
                value={draft.endTime}
                disabled={!draft.enabled}
                onChange={(event) => setDraft((prev) => ({ ...prev, endTime: event.target.value }))}
              />
            </FormField>
          </div>
        </FormFieldGroup>
        <FormActions saveDisabled={!isDirty} onSave={handleSave} onCancel={handleCancel} />
      </div>
    </FormFieldset>
  )
}

function ChannelRow({
  label,
  description,
  checked,
  onChange,
  disabled,
  comingSoon,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
  comingSoon?: boolean
}) {
  return (
    <div
      data-disabled={disabled || undefined}
      className="flex items-start justify-between gap-6 border-t border-border-subtle py-4 first:border-t-0 first:pt-0"
    >
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground">{label}</p>
          {comingSoon ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Coming soon
            </span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  )
}
