import type { SupabaseClient } from "@supabase/supabase-js"

import type { UserProfile, UpdateUserProfile } from "@/src/infrastructure/models/supabase"
import type { AppRole } from "@/src/application/permissions"
import type { IUserManagementService } from "@/src/application/services/user-management.service.interface"
import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"
import "reflect-metadata"
import { injectable } from "tsyringe"

interface MembershipJoinRow {
  id: string
  tenant_id: string
  profile_id: string
  roles: string[] | null
  deleted_at: string | null
  profiles:
    | {
        id: string
        email: string | null
        full_name: string | null
        is_platform_admin: boolean | null
        last_active_tenant_id: string | null
        created_at: string
        updated_at: string
      }
    | {
        id: string
        email: string | null
        full_name: string | null
        is_platform_admin: boolean | null
        last_active_tenant_id: string | null
        created_at: string
        updated_at: string
      }[]
    | null
}

function pickProfile(row: MembershipJoinRow): MembershipJoinRow["profiles"] {
  if (Array.isArray(row.profiles)) return row.profiles[0] ?? null
  return row.profiles
}

function rowToUserProfile(row: MembershipJoinRow): UserProfile | null {
  const profile = pickProfile(row)
  if (!profile || Array.isArray(profile)) return null
  return {
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    avatar_url: null,
    is_platform_admin: profile.is_platform_admin === true,
    last_active_tenant_id: profile.last_active_tenant_id,
    last_sign_in_at: null,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
    membership_id: row.id,
    roles: row.roles ?? [],
    is_inaccessible: row.deleted_at !== null,
  }
}

@injectable()
export class UserManagementService implements IUserManagementService {
  /**
   * Lists users visible to the caller, scoped to their accessible
   * tenants via RLS on `memberships`. Returns one row per membership
   * — single-tenant callers see one row per user. Multi-tenant
   * callers will see duplicates until `activeTenantId` is wired into
   * the read path (step 3 of the tenant-resolution rollout).
   */
  async getAllUsers(): Promise<UserProfile[]> {
    const supabase = await getDatabaseClient()
    // memberships has two FKs to profiles (profile_id + invited_by). The
    // PostgREST embed needs the explicit FK name or the relationship
    // resolves as ambiguous and the error surfaces as an empty {}.
    const { data, error } = await supabase
      .from("memberships")
      .select(
        `
        id,
        tenant_id,
        profile_id,
        roles,
        deleted_at,
        profiles!memberships_profile_id_fkey (
          id,
          email,
          full_name,
          is_platform_admin,
          last_active_tenant_id,
          created_at,
          updated_at
        )
      `
      )
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching users:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      })
      throw error
    }

    const rows = (data ?? []) as unknown as MembershipJoinRow[]
    return rows.map(rowToUserProfile).filter((u): u is UserProfile => u !== null)
  }

  async updateUser(userId: string, updates: UpdateUserProfile): Promise<UserProfile> {
    const supabase = await getDatabaseClient()

    // Profile fields (full_name, email) update on profiles; roles
    // update on the caller-accessible membership row.
    const profilePatch: { full_name?: string | null; email?: string | null } = {}
    if (updates.full_name !== undefined) profilePatch.full_name = updates.full_name
    if (updates.email !== undefined) profilePatch.email = updates.email

    if (Object.keys(profilePatch).length > 0) {
      const { error: profileError } = await supabase
        .from("profiles")
        .update(profilePatch)
        .eq("id", userId)
      if (profileError) {
        console.error("Error updating profile:", profileError)
        throw profileError
      }
    }

    if (updates.roles !== undefined) {
      const { error: membershipError } = await supabase
        .from("memberships")
        .update({ roles: updates.roles })
        .eq("profile_id", userId)
        .is("deleted_at", null)
      if (membershipError) {
        console.error("Error updating membership roles:", membershipError)
        throw membershipError
      }
    }

    return this.findUser(supabase, userId)
  }

  async updateUserRoles(userId: string, roles: AppRole[]): Promise<UserProfile> {
    return this.updateUser(userId, { roles })
  }

  /**
   * Soft-deletes the user's active membership row(s) accessible to the
   * caller. Per-tenant: an admin in tenant A only affects the
   * membership in tenant A. Idempotent under the `memberships_unique_active`
   * UNIQUE(tenant_id, profile_id) constraint — re-running with the
   * same input is a no-op once `deleted_at` is set.
   */
  async deactivateUser(userId: string): Promise<UserProfile> {
    const supabase = await getDatabaseClient()
    const { error } = await supabase
      .from("memberships")
      .update({ deleted_at: new Date().toISOString() })
      .eq("profile_id", userId)
      .is("deleted_at", null)
    if (error) {
      console.error("Error deactivating user:", error)
      throw error
    }
    return this.findUser(supabase, userId)
  }

  async reactivateUser(userId: string): Promise<UserProfile> {
    const supabase = await getDatabaseClient()
    const { error } = await supabase
      .from("memberships")
      .update({ deleted_at: null })
      .eq("profile_id", userId)
    if (error) {
      console.error("Error reactivating user:", error)
      throw error
    }
    return this.findUser(supabase, userId)
  }

  private async findUser(supabase: SupabaseClient, userId: string): Promise<UserProfile> {
    const { data, error } = await supabase
      .from("memberships")
      .select(
        `
        id,
        tenant_id,
        profile_id,
        roles,
        deleted_at,
        profiles!memberships_profile_id_fkey (
          id,
          email,
          full_name,
          is_platform_admin,
          last_active_tenant_id,
          created_at,
          updated_at
        )
      `
      )
      .eq("profile_id", userId)
      .order("deleted_at", { ascending: true, nullsFirst: true })
      .limit(1)
      .maybeSingle()
    if (error) {
      console.error("Error reading user after update:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      })
      throw error
    }
    if (!data) {
      throw new Error(`Membership for profile ${userId} not found`)
    }
    const mapped = rowToUserProfile(data as unknown as MembershipJoinRow)
    if (!mapped) throw new Error(`Failed to map membership row for profile ${userId}`)
    return mapped
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
  /**
   * Tenant to attach the new user to via a `memberships` row. Required
   * because roles are per-tenant — without this the created auth user
   * exists but has no tenant access.
   */
  tenantId: string
}

/**
 * Creates an auth user + sets `profiles.full_name` + creates a
 * `memberships` row with the requested roles for the target tenant.
 * Returns a discriminated result so the route can map cleanly to
 * HTTP status codes without needing to know Supabase's error shape.
 *
 * Idempotency / safety:
 *   - Rejects duplicate email with 409 (the existing route's behavior).
 *   - If profile/membership writes fail after auth-create succeeds,
 *     returns `{ ok: true, warning: ... }` — same as the original
 *     behavior, since the auth user IS created and re-running would
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

  const { error: profileError } = await client
    .from("profiles")
    .update({ full_name: input.fullName.trim() })
    .eq("id", created.user.id)

  if (profileError) {
    console.error("createUserWithProfile profile update error:", profileError)
    return {
      ok: true,
      userId: created.user.id,
      warning: "User created but profile update failed",
    }
  }

  const { error: membershipError } = await client.from("memberships").insert({
    tenant_id: input.tenantId,
    profile_id: created.user.id,
    roles: input.roles,
  })

  if (membershipError) {
    console.error("createUserWithProfile membership insert error:", membershipError)
    return {
      ok: true,
      userId: created.user.id,
      warning: "User created but tenant membership could not be assigned",
    }
  }

  return { ok: true, userId: created.user.id }
}
