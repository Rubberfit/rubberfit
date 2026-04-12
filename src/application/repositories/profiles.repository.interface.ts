export interface ProfileUpdates {
  name?: string
  avatar?: string
}

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

export interface BucketResult {
  success: boolean
  data?: unknown
  message?: string
  error?: string
}

export interface IProfileRepository {
  updateProfile(userId: string, updates: ProfileUpdates): Promise<ProfileUpdateResult>
  uploadAvatar(userId: string, file: File): Promise<AvatarUploadResult>
  createAvatarsBucket(): Promise<BucketResult>
}
