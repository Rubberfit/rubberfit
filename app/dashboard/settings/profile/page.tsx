"use client"

import { useState, useRef, useEffect } from "react"

import { toast } from "sonner"
import { useAuth } from "@/app/contexts/AuthContext"
import { profileService } from "@/src/infrastructure/services/profileService"
import { PageHeader, PageShell } from "@/app/components/patterns"

import { ProfileCard } from "./_components/profile-card"
import { SecurityCard } from "./_components/security-card"
import { MfaCard } from "./_components/mfa-card"
import { AccountInfoCard } from "./_components/account-info-card"
import { DeleteAccountCard } from "./_components/delete-account-card"

export default function ProfileSettingsPage() {
  const { user, updatePassword } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar ?? "")
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (user?.avatar) {
      setAvatarUrl(user.avatar)
    }
  }, [user?.avatar])

  const [profileData, setProfileData] = useState({
    name: user?.name ?? "",
    email: user?.email ?? "",
  })

  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  })

  const handleProfileSave = async () => {
    if (!user) return

    setIsLoading(true)
    try {
      const result = await profileService.updateProfile(user.id, {
        name: profileData.name,
      })

      if (result.success) {
        toast.success("Profile updated successfully")
        // Reload the page to refresh auth context
        window.location.reload()
      } else {
        toast.error("Failed to update profile", {
          description: result.error,
        })
      }
    } catch (_error) {
      toast.error("Failed to update profile")
    } finally {
      setIsLoading(false)
    }
  }

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !user) return

    // Check file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large", {
        description: "Please select an image smaller than 5MB",
      })
      return
    }

    setIsLoading(true)
    try {
      // First create the bucket if it doesn't exist
      await profileService.createAvatarsBucket()

      // Upload the avatar
      const uploadResult = await profileService.uploadAvatar(user.id, file)

      if (uploadResult.success && uploadResult.url) {
        // Update the user profile with the new avatar URL
        const updateResult = await profileService.updateProfile(user.id, {
          avatar: uploadResult.url,
        })

        if (updateResult.success) {
          setAvatarUrl(uploadResult.url)
          toast.success("Profile picture updated successfully")
          // Reload to refresh auth context
          window.location.reload()
        } else {
          toast.error("Failed to update profile picture")
        }
      } else {
        toast.error("Failed to upload image", {
          description: uploadResult.error,
        })
      }
    } catch (_error) {
      toast.error("Failed to upload profile picture")
    } finally {
      setIsLoading(false)
    }
  }

  const handlePasswordChange = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error("New passwords don't match")
      return
    }

    setIsLoading(true)
    try {
      const { success, error } = await updatePassword(passwordData.newPassword)

      if (success) {
        toast.success("Password updated successfully")
        setPasswordData({
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        })
      } else {
        toast.error("Failed to update password", {
          description: error ?? "An unexpected error occurred",
        })
      }
    } catch (_error) {
      toast.error("Failed to update password")
    } finally {
      setIsLoading(false)
    }
  }

  if (!user) {
    return <div>Loading...</div>
  }

  return (
    <PageShell variant="form">
      <PageHeader
        crumbs={[{ label: "Settings", href: "/dashboard/settings" }, { label: "Profile" }]}
        title="Profile"
        subtitle="Personal info, password, two-factor authentication, and account metadata."
      />

      <div className="mx-auto w-full max-w-2xl space-y-10 pb-20">
        <ProfileCard
          user={user}
          avatarUrl={avatarUrl}
          profileData={profileData}
          isLoading={isLoading}
          fileInputRef={fileInputRef}
          onProfileDataChange={setProfileData}
          onAvatarUpload={handleAvatarUpload}
          onProfileSave={handleProfileSave}
        />

        <SecurityCard
          passwordData={passwordData}
          isLoading={isLoading}
          onPasswordDataChange={setPasswordData}
          onPasswordChange={handlePasswordChange}
        />

        <MfaCard />

        <AccountInfoCard user={user} />

        <DeleteAccountCard />
      </div>
    </PageShell>
  )
}
