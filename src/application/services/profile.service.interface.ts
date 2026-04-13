export interface ProfileUpdateResult {
  success: boolean
  data?: unknown
  error?: string
}

export interface AvatarUploadResult {
  success: boolean
  url?: string
  error?: string
}

export interface IProfileService {
  updateProfile(
    userId: string,
    updates: { name?: string; avatar?: string }
  ): Promise<ProfileUpdateResult>
  uploadAvatar(userId: string, file: File): Promise<AvatarUploadResult>
}
