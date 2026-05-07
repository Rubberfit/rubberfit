"use client"

import { Camera } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/app/components/ui/avatar"
import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import {
  FormActions,
  FormField,
  FormFieldGroup,
  FormFieldRow,
  FormFieldset,
  FormSectionHeader,
} from "@/app/components/ui/forms"
import { getInitials } from "@/app/lib/utils"

interface ProfileCardProps {
  user: { name?: string | null; email: string; avatar?: string | null; id: string }
  avatarUrl: string
  profileData: { name: string; email: string }
  isLoading: boolean
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onProfileDataChange: (data: { name: string; email: string }) => void
  onAvatarUpload: (event: React.ChangeEvent<HTMLInputElement>) => void
  onProfileSave: () => void
}

/**
 * Personal profile section. Phase 2 PR 2b chrome — flat section
 * with the new `forms/` primitives. Keeps the existing wired
 * behavior (avatar upload via `profileService`, name update via
 * `auth context`); restyles the layout from the Phase 1 `<Card>`
 * shell to a Phase 2 `<FormFieldset>` + `<FormSectionHeader>`.
 */
export function ProfileCard({
  user,
  avatarUrl,
  profileData,
  isLoading,
  fileInputRef,
  onProfileDataChange,
  onAvatarUpload,
  onProfileSave,
}: ProfileCardProps) {
  return (
    <FormFieldset isFirst>
      <FormSectionHeader
        eyebrow="Profile"
        title="Personal info"
        description="Your name and avatar appear next to your activity across the workspace."
      />
      <div className="mt-6 space-y-6">
        <div className="flex items-center gap-4">
          <Avatar className="size-20 rounded-md">
            <AvatarImage src={avatarUrl} alt={user.name || user.email} />
            <AvatarFallback className="rounded-md text-lg">
              {getInitials(user.name || user.email)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={onAvatarUpload}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={isLoading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera className="mr-2 size-4" aria-hidden="true" />
              {isLoading ? "Uploading…" : "Change photo"}
            </Button>
            <p className="text-xs leading-4 text-muted-foreground">
              JPG, PNG, GIF, or WEBP. Max 5MB.
            </p>
          </div>
        </div>

        <FormFieldGroup>
          <FormFieldRow>
            <FormField label="Display name" htmlFor="profile-name">
              <Input
                id="profile-name"
                value={profileData.name}
                onChange={(event) =>
                  onProfileDataChange({ ...profileData, name: event.target.value })
                }
              />
            </FormField>
            <FormField
              label="Email address"
              htmlFor="profile-email"
              helperText="Email changes require verification (coming soon)."
            >
              <Input
                id="profile-email"
                type="email"
                value={profileData.email}
                disabled
                className="bg-muted/40"
              />
            </FormField>
          </FormFieldRow>
        </FormFieldGroup>

        <FormActions
          isSaving={isLoading}
          onSave={onProfileSave}
          saveLabel={isLoading ? "Saving…" : "Save"}
          // Auth-context propagates the saved value, so revert is a
          // hard reload owned by the parent — no cancel button on this section.
          hideCancel
        />
      </div>
    </FormFieldset>
  )
}
