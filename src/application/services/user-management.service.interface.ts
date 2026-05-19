import type { AppRole } from "@/src/application/permissions"
import type { UserProfile, UpdateUserProfile } from "@/src/infrastructure/models/supabase"

export type { UserProfile, UpdateUserProfile }

export interface IUserManagementService {
  /** Return all profiles visible to the caller (admin sees all; RLS filters otherwise). */
  getAllUsers(): Promise<UserProfile[]>

  /** Update mutable profile fields (full_name, email) and per-tenant roles. */
  updateUser(userId: string, updates: UpdateUserProfile): Promise<UserProfile>

  /** Convenience: set roles for a user. */
  updateUserRoles(userId: string, roles: AppRole[]): Promise<UserProfile>

  /** Soft-delete: flip `memberships.deleted_at` per-tenant. */
  deactivateUser(userId: string): Promise<UserProfile>

  /** Restore a previously deactivated membership: clear `deleted_at`. */
  reactivateUser(userId: string): Promise<UserProfile>
}
