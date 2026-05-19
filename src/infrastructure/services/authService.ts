import { supabase } from "@/src/infrastructure/models/supabase"
import { getBrowserAppUrl } from "@/app/lib/app-url"
import { normalizeRoles } from "@/src/application/rbac"
import type {
  AuthChangeEvent,
  AuthError,
  Session,
  SupabaseClient,
  User as SupabaseUser,
} from "@supabase/supabase-js"
import type {
  IAuthService,
  AuthUser,
  AuthResponse,
} from "@/src/application/services/auth.service.interface"
import "reflect-metadata"
import { injectable } from "tsyringe"

export type { AuthUser, AuthResponse }
interface ProfileData {
  roles: string[]
  isSuperAdmin: boolean
}

function generateRandomAvatar(seed: string): string {
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed)}&backgroundColor=2563eb&textColor=ffffff`
}

function getUserAvatar(user: SupabaseUser): string {
  return (
    user.user_metadata?.avatar_url ||
    user.user_metadata?.picture ||
    user.user_metadata?.avatar ||
    generateRandomAvatar(user.email!)
  )
}

function getUserName(user: SupabaseUser): string | undefined {
  return user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0]
}

function getUserAuthProvider(user: SupabaseUser): string | undefined {
  const provider = user.app_metadata?.provider
  return typeof provider === "string" ? provider : undefined
}

async function getProfileRoles(userId: string): Promise<ProfileData> {
  // Roles are per-tenant on `memberships` under the new schema. We
  // surface the union across all active memberships so existing
  // permission checks (which assume a single role list) keep working
  // until ActionActor grows an `activeTenantId` and these checks
  // become per-tenant.
  try {
    const [profileResult, membershipsResult] = await Promise.all([
      supabase.from("profiles").select("is_platform_admin").eq("id", userId).maybeSingle(),
      supabase.from("memberships").select("roles").eq("profile_id", userId).is("deleted_at", null),
    ])
    const profileData = profileResult.data as { is_platform_admin: boolean | null } | null
    const membershipRows = membershipsResult.data as { roles: string[] | null }[] | null

    const rolesUnion = new Set<string>()
    for (const row of membershipRows ?? []) {
      for (const role of row.roles ?? []) {
        rolesUnion.add(role)
      }
    }
    return {
      roles: normalizeRoles(Array.from(rolesUnion)),
      isSuperAdmin: profileData?.is_platform_admin === true,
    }
  } catch (error) {
    console.error("Error loading profile roles:", error)
    return { roles: normalizeRoles(), isSuperAdmin: false }
  }
}

/**
 * Returns true when the caller cannot meaningfully act in the app:
 * no profile row, OR no active memberships AND not a platform admin.
 * Platform admins bypass tenant gating via `auth_is_platform_admin()`
 * RLS, so they remain accessible even without memberships.
 */
async function isAccountInaccessible(userId: string): Promise<boolean> {
  const [profileResult, membershipsCountResult] = await Promise.all([
    supabase.from("profiles").select("is_platform_admin").eq("id", userId).maybeSingle(),
    supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", userId)
      .is("deleted_at", null),
  ])
  const profile = profileResult.data as { is_platform_admin: boolean | null } | null
  const count = membershipsCountResult.count ?? 0

  if (!profile) return true
  if (profile.is_platform_admin === true) return false
  return count === 0
}

async function buildAuthUser(user: SupabaseUser): Promise<AuthUser> {
  const { roles, isSuperAdmin } = await getProfileRoles(user.id)
  return {
    id: user.id,
    email: user.email!,
    name: getUserName(user),
    avatar: getUserAvatar(user),
    roles: roles,
    isSuperAdmin,
    authProvider: getUserAuthProvider(user),
    createdAt: user.created_at,
  }
}

@injectable()
export class AuthService implements IAuthService {
  async signIn(email: string, password: string): Promise<AuthResponse> {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        return { user: null, error }
      }

      if (!data.user) {
        return {
          user: null,
          error: {
            message: "No user returned from sign in",
            name: "AuthError",
            status: 400,
          } as AuthError,
        }
      }

      if (await isAccountInaccessible(data.user.id)) {
        await supabase.auth.signOut()
        return {
          user: null,
          error: {
            message: "This account has been deactivated. Please contact your administrator.",
            name: "AuthError",
            status: 403,
          } as AuthError,
        }
      }

      return { user: await buildAuthUser(data.user), error: null }
    } catch (error) {
      return {
        user: null,
        error: {
          message: error instanceof Error ? error.message : "An unexpected error occurred",
          name: "AuthError",
          status: 500,
        } as AuthError,
      }
    }
  }

  async signUp(email: string, password: string): Promise<AuthResponse> {
    try {
      const avatar = generateRandomAvatar(email)

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: email.split("@")[0],
            avatar_url: avatar,
          },
        },
      })

      if (error) {
        return { user: null, error }
      }

      if (!data.user) {
        return {
          user: null,
          error: {
            message: "No user returned from sign up",
            name: "AuthError",
            status: 400,
          } as AuthError,
        }
      }

      return {
        user: await buildAuthUser({
          ...data.user,
          user_metadata: {
            ...data.user.user_metadata,
            avatar_url: data.user.user_metadata?.avatar_url || avatar,
          },
        }),
        error: null,
      }
    } catch (error) {
      return {
        user: null,
        error: {
          message: error instanceof Error ? error.message : "An unexpected error occurred",
          name: "AuthError",
          status: 500,
        } as AuthError,
      }
    }
  }

  async signOut(): Promise<{ error: AuthError | null }> {
    try {
      const { error } = await supabase.auth.signOut()
      return { error }
    } catch (error) {
      return {
        error: {
          message: error instanceof Error ? error.message : "An unexpected error occurred",
          name: "AuthError",
          status: 500,
        } as AuthError,
      }
    }
  }

  async resetPassword(email: string): Promise<{ error: AuthError | null }> {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getBrowserAppUrl("/auth/v2/reset-password?mode=recovery"),
      })
      return { error }
    } catch (error) {
      return {
        error: {
          message: error instanceof Error ? error.message : "An unexpected error occurred",
          name: "AuthError",
          status: 500,
        } as AuthError,
      }
    }
  }

  async updatePassword(password: string): Promise<AuthResponse> {
    try {
      const { error } = await supabase.auth.updateUser({ password })

      if (error) {
        return { user: null, error }
      }

      const user = await this.getCurrentUser()

      if (!user) {
        return {
          user: null,
          error: {
            message: "Password updated, but failed to retrieve the current user",
            name: "AuthError",
            status: 500,
          } as AuthError,
        }
      }

      return { user, error: null }
    } catch (error) {
      return {
        user: null,
        error: {
          message: error instanceof Error ? error.message : "An unexpected error occurred",
          name: "AuthError",
          status: 500,
        } as AuthError,
      }
    }
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        return null
      }

      return buildAuthUser(user)
    } catch (error) {
      console.error("Error getting current user:", error)
      return null
    }
  }

  async getSession() {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      return session
    } catch (error) {
      console.error("Error getting session:", error)
      return null
    }
  }

  onAuthStateChange(callback: (user: AuthUser | null) => void) {
    // Per the supabase-js docstring on `onAuthStateChange`: the callback
    // runs synchronously inside the auth state-change pipeline, so any
    // `await` on another Supabase method (here `buildAuthUser` →
    // `from("profiles")…` which internally calls `auth.getSession()`)
    // deadlocks against `_initialize`'s lock-held SIGNED_IN broadcast.
    // We saw this manifest as `/mfa-challenge` getting stuck on
    // "Loading your authenticator factor…" in production, because the
    // form's `getPrimaryFactor()` waits on `initializePromise` which
    // never resolves while this callback is mid-Supabase-call. The
    // upstream-recommended fix is to defer the body to a fresh task.
    return supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      setTimeout(async () => {
        try {
          if ((event === "SIGNED_IN" || event === "PASSWORD_RECOVERY") && session?.user) {
            callback(await buildAuthUser(session.user))
          } else if (event === "SIGNED_OUT") {
            callback(null)
          }
        } catch (err) {
          // Fire-and-forget setTimeout means an exception here surfaces
          // as an unhandled rejection. Log and fall back to a null user
          // so AuthContext doesn't get pinned at `loading: true`.
          console.error("[auth] onAuthStateChange handler failed:", err)
          callback(null)
        }
      }, 0)
    })
  }
}

export const authService = new AuthService()

// ── Server-side (admin client) helpers ───────────────────────────────
// Mirror of `cutHistoryService` server-side helpers: API routes pass
// a service-role client and we own all DB access. Keeps `.from(...)`
// calls out of the route layer.

export interface ProfileAccess {
  /**
   * When `tenantId` is passed to `getProfileAccess`, this is the roles
   * array from the specific membership in that tenant (or `[]` when
   * the user has no active membership there). Without a tenant hint
   * it's the union across all active memberships — used by the proxy
   * permission gate before a cookie-resolved tenant is available, and
   * the chooser flow where there's no tenant yet.
   */
  roles: string[]
  /** Mirrors `profiles.is_platform_admin`. */
  isSuperAdmin: boolean
  /**
   * `true` when the account cannot meaningfully act:
   *   - no profile row, OR
   *   - zero active memberships AND not a platform admin.
   *
   * Sign-in already rejects inaccessible accounts, but an admin can
   * soft-delete a user's last membership mid-session — the JWT stays
   * valid until expiry, so callers (middleware, route guards, action
   * helpers) MUST check this and fail closed.
   *
   * Renamed from `isDeleted` when the per-tenant membership soft-delete
   * replaced the global `profiles.is_deleted` column.
   */
  isInaccessible: boolean
  /**
   * `true` when the profile row exists. Distinguishes "no profile" from
   * "profile present but no active memberships" so callers that want
   * to log the missing-row case loudly can do so without changing the
   * deny outcome.
   */
  hasProfile: boolean
}

/**
 * Fetches the roles + platform-admin flag + accessibility for an
 * already-authenticated user. Used by the admin guard helper, the proxy
 * middleware, and `requireAuthenticatedUser` to centralize the RBAC +
 * accessibility lookup that every protected boundary needs.
 *
 * Pass `tenantId` to scope `roles` to a single membership (per-tenant
 * roles — the production shape once a tenant is resolved). Omit it
 * for the role-union fallback used before a tenant is known
 * (proxy permission gate without cookie, chooser flow).
 *
 * `isInaccessible` is computed against the **set of all** active
 * memberships, not just the tenant-scoped roles array — a user with
 * an active membership in tenant B is still accessible even if we
 * filter roles to tenant A and that membership row hasn't been read.
 *
 * Returns `isInaccessible: true` + `hasProfile: false` when no profile
 * row exists so callers can fail-closed with one check.
 */
export async function getProfileAccess(
  client: SupabaseClient,
  userId: string,
  tenantId?: string | null
): Promise<ProfileAccess> {
  const tenantRolesQuery = tenantId
    ? client
        .from("memberships")
        .select("roles")
        .eq("profile_id", userId)
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null })

  const [profileResult, allMembershipsResult, tenantRolesResult] = await Promise.all([
    client
      .from("profiles")
      .select("is_platform_admin")
      .eq("id", userId)
      .maybeSingle<{ is_platform_admin: boolean | null }>(),
    client.from("memberships").select("roles").eq("profile_id", userId).is("deleted_at", null),
    tenantRolesQuery,
  ])

  if (profileResult.error) {
    console.error("authService.getProfileAccess profile error:", profileResult.error)
    throw profileResult.error
  }
  if (allMembershipsResult.error) {
    console.error("authService.getProfileAccess memberships error:", allMembershipsResult.error)
    throw allMembershipsResult.error
  }

  if (!profileResult.data) {
    return { roles: [], isSuperAdmin: false, isInaccessible: true, hasProfile: false }
  }

  const allMembershipRows = (allMembershipsResult.data ?? []) as { roles: string[] | null }[]
  const isSuperAdmin = profileResult.data.is_platform_admin === true
  // Platform admins remain accessible without memberships; their
  // is_platform_admin flag drives the auth_is_platform_admin() RLS
  // bypass so they can still act across tenants.
  const isInaccessible = !isSuperAdmin && allMembershipRows.length === 0

  let roles: string[]
  if (tenantId) {
    const tenantRow = tenantRolesResult.data as { roles: string[] | null } | null
    roles = tenantRow?.roles ?? []
  } else {
    const rolesUnion = new Set<string>()
    for (const row of allMembershipRows) {
      for (const role of row.roles ?? []) {
        rolesUnion.add(role)
      }
    }
    roles = Array.from(rolesUnion)
  }

  return {
    roles,
    isSuperAdmin,
    isInaccessible,
    hasProfile: true,
  }
}

/**
 * Returns the `is_platform_admin` flag — used by `proxy.ts` middleware
 * which only needs that bit (no role list).
 */
export async function getSuperAdminFlag(client: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await client
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", userId)
    .maybeSingle<{ is_platform_admin: boolean | null }>()

  if (error) {
    console.error("authService.getSuperAdminFlag error:", error)
    return false
  }
  return data?.is_platform_admin === true
}

/**
 * Upsert helper for the OAuth callback: creates or updates the
 * `profiles` row from a fresh auth user. Role assignment is per-tenant
 * on the `memberships` table now and is handled separately when the
 * user joins a tenant (invitation accept flow).
 */
export async function upsertProfileFromAuth(
  client: SupabaseClient,
  userId: string,
  email: string | null,
  fullName: string | null
): Promise<void> {
  const payload: { id: string; email?: string; full_name?: string } = { id: userId }
  if (email !== null) payload.email = email
  if (fullName !== null) payload.full_name = fullName

  const { error } = await client.from("profiles").upsert(payload, { onConflict: "id" })
  if (error) {
    console.error("authService.upsertProfileFromAuth error:", error)
    throw error
  }
}
