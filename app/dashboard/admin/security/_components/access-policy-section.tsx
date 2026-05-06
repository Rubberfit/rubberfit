"use client"

import { useCallback, useState } from "react"
import { toast } from "sonner"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select"
import { Switch } from "@/app/components/ui/switch"
import { FormActions, FormFieldset, FormSectionHeader } from "@/app/components/ui/forms"

interface AccessPolicyState {
  mfaRequired: boolean
  sessionTimeoutHours: string
}

// TODO(ARC-DASHBOARD-AUDIT): replace with `securityPolicyService.get()`.
const POLICY_DEFAULTS: AccessPolicyState = {
  mfaRequired: false,
  sessionTimeoutHours: "8",
}

export function AccessPolicySection() {
  const [baseline, setBaseline] = useState<AccessPolicyState>(POLICY_DEFAULTS)
  const [draft, setDraft] = useState<AccessPolicyState>(POLICY_DEFAULTS)

  const isDirty =
    draft.mfaRequired !== baseline.mfaRequired ||
    draft.sessionTimeoutHours !== baseline.sessionTimeoutHours

  const handleSave = useCallback(() => {
    // TODO(ARC-DASHBOARD-AUDIT): wire to `securityPolicyService.update(...)`
    setBaseline(draft)
    toast.success("Access policy saved")
  }, [draft])

  const handleCancel = useCallback(() => {
    setDraft(baseline)
  }, [baseline])

  return (
    <FormFieldset isFirst>
      <FormSectionHeader
        eyebrow="Access policy"
        title="Sign-in & session controls"
        description="Tenant-wide rules that gate how operators authenticate and how long their sessions stay open."
      />
      <div className="mt-6 space-y-2">
        <div className="flex items-start justify-between gap-6 border-t border-border-subtle py-4 first:border-t-0 first:pt-0">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">
              Require multi-factor authentication
            </p>
            <p className="text-xs text-muted-foreground">
              When enabled, every member must enroll a TOTP authenticator before they can sign in.
              In-flight sessions are not affected; the gate triggers on the next sign-in.
            </p>
          </div>
          <Switch
            aria-label="Require multi-factor authentication"
            checked={draft.mfaRequired}
            onCheckedChange={(value) => setDraft((prev) => ({ ...prev, mfaRequired: value }))}
          />
        </div>

        <div className="flex flex-col gap-3 border-t border-border-subtle py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">Session timeout</p>
            <p className="text-xs text-muted-foreground">
              Inactive sessions auto-expire after the selected window.
            </p>
          </div>
          <Select
            value={draft.sessionTimeoutHours}
            onValueChange={(value) => setDraft((prev) => ({ ...prev, sessionTimeoutHours: value }))}
          >
            <SelectTrigger className="w-full sm:w-[160px]" aria-label="Session timeout">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 hour</SelectItem>
              <SelectItem value="4">4 hours</SelectItem>
              <SelectItem value="8">8 hours</SelectItem>
              <SelectItem value="24">24 hours</SelectItem>
              <SelectItem value="168">7 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <FormActions saveDisabled={!isDirty} onSave={handleSave} onCancel={handleCancel} />
    </FormFieldset>
  )
}
