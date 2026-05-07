import type { SupabaseClient } from "@supabase/supabase-js"

import type { UserProfile, UpdateUserProfile } from "@/src/infrastructure/models/supabase"
import type { AppRole } from "@/src/application/permissions"
import type { IUserManagementService } from "@/src/application/services/user-management.service.interface"
import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"
import "reflect-metadata"
import { injectable } from "tsyringe"

@injectable()
export class UserManagementService implements IUserManagementService {
  async getAllUsers(): Promise<UserProfile[]> {
    try {
      const supabase = await getDatabaseClient()
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false })

      if (error) throw error
      return data as UserProfile[]
    } catch (error) {
      console.error("Error fetching users:", error)
      throw error
    }
  }

  async updateUser(userId: string, updates: UpdateUserProfile): Promise<UserProfile> {
    try {
      const supabase = await getDatabaseClient()
      const { data, error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", userId)
        .select()
        .single()

      if (error) throw error
      return data as UserProfile
    } catch (error) {
      console.error("Error updating user:", error)
      throw error
    }
  }

  async updateUserRoles(userId: string, roles: AppRole[]): Promise<UserProfile> {
    return this.updateUser(userId, { roles })
  }

  async deactivateUser(userId: string): Promise<UserProfile> {
    return this.updateUser(userId, { is_deleted: true })
  }

  async reactivateUser(userId: string): Promise<UserProfile> {
    return this.updateUser(userId, { is_deleted: false })
  }
}

export const userManagementService = new UserManagementService()

// ── Server-side (admin client) helpers ───────────────────────────────

export interface DirectoryUser {
  id: string
  full_name: string | null
  email: string | null
}

/**
 * Lightweight directory listing used by the admin/manager/supervisor
 * dropdown. Returns only the columns the dropdown renders. Sorting by
 * full_name keeps the UX stable.
 */
export async function listDirectoryUsers(client: SupabaseClient): Promise<DirectoryUser[]> {
  const { data, error } = await client
    .from("profiles")
    .select("id, full_name, email")
    .order("full_name", { ascending: true })

  if (error) {
    console.error("listDirectoryUsers error:", error)
    throw error
  }
  return (data ?? []) as DirectoryUser[]
}

export type CreateUserResult =
  | { ok: true; userId: string; warning?: string }
  | { ok: false; status: 400 | 409 | 500; error: string }

export interface CreateUserInput {
  email: string
  password: string
  fullName: string
  roles: AppRole[]
}

/**
 * Creates an auth user + flips the auto-created profile to the desired
 * `full_name` + `roles`. Returns a discriminated result so the route
 * can map cleanly to HTTP status codes without needing to know
 * Supabase's error shape.
 *
 * Idempotency / safety:
 *   - Rejects duplicate email with 409 (the existing route's behavior).
 *   - If profile-update fails after auth-create succeeds, returns
 *     `{ ok: true, warning: ... }` — same as the original route, since
 *     the user IS created and re-running with the same email would
 *     incorrectly hit the duplicate guard.
 */
export async function createUserWithProfile(
  client: SupabaseClient,
  input: CreateUserInput
): Promise<CreateUserResult> {
  const normalizedEmail = input.email.trim().toLowerCase()

  const { data: existing, error: existingError } = await client
    .from("profiles")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle()

  if (existingError) {
    console.error("createUserWithProfile precheck error:", existingError)
    return { ok: false, status: 500, error: "Failed to verify email availability" }
  }

  if (existing) {
    return { ok: false, status: 409, error: "An account with this email already exists" }
  }

  const { data: created, error: createError } = await client.auth.admin.createUser({
    email: normalizedEmail,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName.trim() },
  })

  if (createError || !created.user) {
    const message = createError?.message ?? "Failed to create user"
    if (createError && /already|exists|duplicate/i.test(message)) {
      return { ok: false, status: 409, error: "An account with this email already exists" }
    }
    return { ok: false, status: 400, error: message }
  }

  const { data: profileRow, error: profileError } = await client
    .from("profiles")
    .update({ full_name: input.fullName.trim(), roles: input.roles })
    .eq("id", created.user.id)
    .select("id")
    .maybeSingle()

  if (profileError || !profileRow) {
    console.error("createUserWithProfile profile update error:", profileError)
    return {
      ok: true,
      userId: created.user.id,
      warning: "User created but profile update failed",
    }
  }

  return { ok: true, userId: created.user.id }
}
