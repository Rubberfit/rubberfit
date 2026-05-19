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
   * Marks the caller's account as inaccessible by soft-deleting every
   * active `memberships` row (per-tenant). The auth row stays so that
   * the GoTrue session can still sign out cleanly; the `/callback`
   * and login paths reject accounts with zero active memberships and
   * the account becomes unusable from the customer's perspective. An
   * admin in any of the user's former tenants can restore by
   * clearing the membership's `deleted_at`.
   */
  requestSelfDelete(userId: string): Promise<SelfDeleteResult>
}
