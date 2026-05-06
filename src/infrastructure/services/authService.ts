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
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("roles, super_admin")
      .eq("id", userId)
      .maybeSingle()

    if (error) {
      console.error("Error loading profile roles:", error)
      return { roles: normalizeRoles(), isSuperAdmin: false }
    }

    return { roles: normalizeRoles(data?.roles), isSuperAdmin: data?.super_admin === true }
  } catch (error) {
    console.error("Error loading profile roles:", error)
    return { roles: normalizeRoles(), isSuperAdmin: false }
  }
}

async function isProfileDeleted(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("is_deleted")
    .eq("id", userId)
    .maybeSingle()

  return data?.is_deleted === true
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

      if (await isProfileDeleted(data.user.id)) {
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
  roles: string[]
  isSuperAdmin: boolean
  /**
   * Soft-delete flag from `profiles.is_deleted`. Sign-in already rejects
   * deactivated accounts, but a user deactivated mid-session keeps a
   * valid JWT until it expires — so callers (middleware, route guards,
   * action helpers) MUST check this and fail closed.
   *
   * `null` means "no profile row found" — we surface the missing-row
   * case as `is_deleted: true` so callers can default-deny without
   * needing to special-case it.
   */
  isDeleted: boolean
  /**
   * `true` when the profile row exists. Distinguishes "no row" from
   * "row with is_deleted=true" for callers that want to log the
   * missing-row case loudly without changing the deny outcome.
   */
  hasProfile: boolean
}

/**
 * Fetches `profiles.roles` + `profiles.super_admin` + `profiles.is_deleted`
 * for an already-authenticated user. Used by the admin guard helper,
 * the proxy middleware, and `requireAuthenticatedUser` to centralize
 * the RBAC + deactivation lookup that every protected boundary needs.
 *
 * Returns is_deleted=true (and hasProfile=false) when no profile row
 * exists, so callers can fail-closed with a single `if (access.isDeleted)`
 * check instead of separately handling the missing-row case.
 */
export async function getProfileAccess(
  client: SupabaseClient,
  userId: string
): Promise<ProfileAccess> {
  const { data, error } = await client
    .from("profiles")
    .select("roles, super_admin, is_deleted")
    .eq("id", userId)
    .maybeSingle<{
      roles: string[] | null
      super_admin: boolean | null
      is_deleted: boolean | null
    }>()

  if (error) {
    console.error("authService.getProfileAccess error:", error)
    throw error
  }
  if (!data) {
    return { roles: [], isSuperAdmin: false, isDeleted: true, hasProfile: false }
  }
  return {
    roles: Array.isArray(data.roles) ? (data.roles ?? []) : [],
    isSuperAdmin: data.super_admin === true,
    isDeleted: data.is_deleted === true,
    hasProfile: true,
  }
}

/**
 * Returns just the `super_admin` flag — used by `proxy.ts` middleware
 * which only needs that bit (no role list).
 */
export async function getSuperAdminFlag(client: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await client
    .from("profiles")
    .select("super_admin")
    .eq("id", userId)
    .maybeSingle<{ super_admin: boolean | null }>()

  if (error) {
    console.error("authService.getSuperAdminFlag error:", error)
    return false
  }
  return data?.super_admin === true
}

/**
 * Upsert helper for the OAuth callback: creates or updates the
 * `profiles` row from a fresh auth user. Defers default-role
 * assignment to the database trigger.
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
