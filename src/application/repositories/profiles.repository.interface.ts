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

export interface SelfDeleteResult {
  success: boolean
  error?: string
}

export interface IProfileRepository {
  updateProfile(userId: string, updates: ProfileUpdates): Promise<ProfileUpdateResult>
  uploadAvatar(userId: string, file: File): Promise<AvatarUploadResult>
  createAvatarsBucket(): Promise<BucketResult>
  /**
   * Marks the caller's profile as deleted (soft-delete).
   * The auth row stays so that the GoTrue session can still
   * sign out cleanly and so an admin can restore if needed; the
   * `/callback` and login paths reject `is_deleted` profiles and
   * the account becomes unusable from the customer's perspective.
   */
  requestSelfDelete(userId: string): Promise<SelfDeleteResult>
}
