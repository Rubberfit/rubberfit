"use client"

import { Input } from "@/app/components/ui/input"
import {
  FormActions,
  FormField,
  FormFieldGroup,
  FormFieldRow,
  FormFieldset,
  FormSectionHeader,
} from "@/app/components/ui/forms"

interface SecurityCardProps {
  passwordData: {
    currentPassword: string
    newPassword: string
    confirmPassword: string
  }
  isLoading: boolean
  onPasswordDataChange: (data: {
    currentPassword: string
    newPassword: string
    confirmPassword: string
  }) => void
  onPasswordChange: () => void
}

/**
 * Password change section. Phase 2 PR 2b chrome — flat
 * `<FormFieldset>` instead of the Phase 1 `<Card>` shell. Wired
 * behavior is unchanged: parent owns the password draft and
 * dispatches the actual update via auth-context.
 */
export function SecurityCard({
  passwordData,
  isLoading,
  onPasswordDataChange,
  onPasswordChange,
}: SecurityCardProps) {
  const isComplete =
    passwordData.currentPassword.length > 0 &&
    passwordData.newPassword.length > 0 &&
    passwordData.confirmPassword.length > 0

  return (
    <FormFieldset>
      <FormSectionHeader
        eyebrow="Security"
        title="Password"
        description="Change the password used to sign in to your account."
      />
      <div className="mt-6 space-y-5">
        <FormFieldGroup>
          <FormField label="Current password" htmlFor="current-password" required>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={passwordData.currentPassword}
              onChange={(event) =>
                onPasswordDataChange({
                  ...passwordData,
                  currentPassword: event.target.value,
                })
              }
            />
          </FormField>
          <FormFieldRow>
            <FormField
              label="New password"
              htmlFor="new-password"
              required
              helperText="Use at least 8 characters."
            >
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={passwordData.newPassword}
                onChange={(event) =>
                  onPasswordDataChange({
                    ...passwordData,
                    newPassword: event.target.value,
                  })
                }
              />
            </FormField>
            <FormField label="Confirm new password" htmlFor="confirm-password" required>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={passwordData.confirmPassword}
                onChange={(event) =>
                  onPasswordDataChange({
                    ...passwordData,
                    confirmPassword: event.target.value,
                  })
                }
              />
            </FormField>
          </FormFieldRow>
        </FormFieldGroup>
        <FormActions
          isSaving={isLoading}
          saveDisabled={!isComplete}
          saveLabel={isLoading ? "Updating…" : "Update password"}
          onSave={onPasswordChange}
          hideCancel
        />
      </div>
    </FormFieldset>
  )
}
