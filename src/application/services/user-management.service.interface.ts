import type { AppRole } from "@/src/application/permissions"
import type { UserProfile, UpdateUserProfile } from "@/src/infrastructure/models/supabase"

export type { UserProfile, UpdateUserProfile }

export interface IUserManagementService {
  /** Return all profiles visible to the caller (admin sees all; RLS filters otherwise). */
  getAllUsers(): Promise<UserProfile[]>

  /** Update mutable profile fields (full_name, email, roles, is_deleted). */
  updateUser(userId: string, updates: UpdateUserProfile): Promise<UserProfile>

  /** Convenience: set roles for a user. */
  updateUserRoles(userId: string, roles: AppRole[]): Promise<UserProfile>

  /** Soft-delete: set is_deleted = true. */
  deactivateUser(userId: string): Promise<UserProfile>

  /** Restore a previously deactivated user: set is_deleted = false. */
  reactivateUser(userId: string): Promise<UserProfile>
}
