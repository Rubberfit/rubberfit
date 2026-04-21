import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime"

import { getBrowserAppUrl } from "@/app/lib/app-url"
import { resolvePostAuthRedirect, sanitizeRedirectPath } from "@/app/lib/auth-redirect"
import { supabase } from "@/src/infrastructure/models/supabase"
import { type AuthUser, authService } from "@/src/infrastructure/services/authService"
import { authMfaService } from "@/src/infrastructure/services/authMfaService"

type AuthResult = { success: boolean; error?: string }
/**
 * Sign-in result that also reports when the caller still needs to
 * pass an MFA challenge before the session is usable. `success` is
 * true the moment the password verifies; `mfaRequired` gates the
 * redirect so the login form can show a code-entry step first.
 */
export type SignInResult = AuthResult & {
  mfaRequired?: boolean
  factorId?: string
}
type SetUser = (user: AuthUser | null) => void
type SetLoading = (loading: boolean) => void

export function createSignIn(setUser: SetUser, setLoading: SetLoading, router: AppRouterInstance) {
  return async (
    email: string,
    password: string,
    redirectTo?: string | null
  ): Promise<SignInResult> => {
    setLoading(true)
    try {
      const { user: authUser, error } = await authService.signIn(email, password)

      if (error) {
        setLoading(false)
        return { success: false, error: error.message }
      }

      if (!authUser) {
        setLoading(false)
        return { success: false, error: "Authentication failed" }
      }

      // Password cleared — before redirecting, check if GoTrue wants
      // the session upgraded to aal2 via MFA. If so, defer the
      // redirect to the login form's challenge step.
      let mfaRequired = false
      let factorId: string | undefined
      try {
        const challengeRequired = await authMfaService.isChallengeRequired()
        const primary = challengeRequired
          ? await authMfaService.getPrimaryFactor()
          : null
        console.log("[auth] post-signin MFA check", {
          challengeRequired,
          primaryFactor: primary?.id ?? null,
        })
        if (challengeRequired && primary) {
          mfaRequired = true
          factorId = primary.id
        }
      } catch (err) {
        // If the MFA probe fails we fall through to the normal
        // redirect path — better to let the user into a password-
        // only session than to wedge them behind an unresolvable
        // challenge prompt.
        console.error("[auth] MFA probe failed:", err)
      }

      setUser(authUser)
      if (mfaRequired && factorId) {
        // Caller (login form) shows the challenge step and calls
        // `completeMfaChallenge` below to finish the redirect.
        setLoading(false)
        return { success: true, mfaRequired: true, factorId }
      }
      router.push(resolvePostAuthRedirect(authUser.roles, redirectTo))
      return { success: true }
    } catch (error) {
      setLoading(false)
      return {
        success: false,
        error: error instanceof Error ? error.message : "An unexpected error occurred",
      }
    }
  }
}

/**
 * Verifies the TOTP code for a login-time MFA challenge and, on
 * success, redirects the same way a non-MFA sign-in would. Kept
 * outside `signIn` so the UI can show progress state separately
 * from the password step.
 *
 * The user + loading state MUST be pushed into AuthContext before
 * the navigation fires — otherwise the destination page mounts
 * while `loading: true` and `user: null`, and the layout's
 * ProtectedRoute wrapper sits spinning forever.
 */
export function createCompleteMfaChallenge(
  setUser: SetUser,
  setLoading: SetLoading,
  router: AppRouterInstance
) {
  return async (
    factorId: string,
    code: string,
    redirectTo?: string | null
  ): Promise<AuthResult> => {
    setLoading(true)
    try {
      await authMfaService.challengeLogin(factorId, code)
      const user = await authService.getCurrentUser()
      setUser(user)
      setLoading(false)
      router.push(resolvePostAuthRedirect(user?.roles ?? [], redirectTo))
      return { success: true }
    } catch (error) {
      setLoading(false)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Invalid code",
      }
    }
  }
}

export function createSignUp(setUser: SetUser, setLoading: SetLoading) {
  return async (email: string, password: string): Promise<AuthResult> => {
    setLoading(true)
    try {
      const { user: authUser, error } = await authService.signUp(email, password)

      if (error) {
        setLoading(false)
        return { success: false, error: error.message }
      }

      if (authUser) {
        setUser(authUser)
        setLoading(false)
        return { success: true }
      }

      setLoading(false)
      return { success: false, error: "Registration failed" }
    } catch (error) {
      setLoading(false)
      return {
        success: false,
        error: error instanceof Error ? error.message : "An unexpected error occurred",
      }
    }
  }
}

export function createSignOut(setUser: SetUser, setLoading: SetLoading, router: AppRouterInstance) {
  return async (): Promise<void> => {
    setLoading(true)
    try {
      await authService.signOut()
      setUser(null)
      router.push("/auth/v2/login")
    } catch (error) {
      console.error("Sign out error:", error)
    } finally {
      setLoading(false)
    }
  }
}

export function createResetPassword() {
  return async (email: string): Promise<AuthResult> => {
    try {
      const { error } = await authService.resetPassword(email)

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "An unexpected error occurred",
      }
    }
  }
}

export function createUpdatePassword(setUser: SetUser, setLoading: SetLoading) {
  return async (
    password: string
  ): Promise<{ success: boolean; error?: string; redirectTo?: string }> => {
    setLoading(true)

    try {
      const { user: authUser, error } = await authService.updatePassword(password)

      if (error) {
        return { success: false, error: error.message }
      }

      if (!authUser) {
        return {
          success: false,
          error: "Failed to refresh authenticated user after password update",
        }
      }

      setUser(authUser)

      return {
        success: true,
        redirectTo: resolvePostAuthRedirect(authUser.roles),
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "An unexpected error occurred",
      }
    } finally {
      setLoading(false)
    }
  }
}

export function createSignInWithGoogle() {
  return async (redirectTo?: string | null): Promise<AuthResult> => {
    try {
      const callbackUrl = new URL(getBrowserAppUrl("/callback"))
      const safeRedirect = sanitizeRedirectPath(redirectTo)

      if (safeRedirect) {
        callbackUrl.searchParams.set("next", safeRedirect)
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl.toString(),
          scopes: "openid email profile https://www.googleapis.com/auth/userinfo.profile",
          queryParams: {
            access_type: "offline",
            prompt: "consent",
            include_granted_scopes: "true",
          },
        },
      })

      if (error) {
        return { success: false, error: error.message }
      }
      return { success: true }
    } catch (_error) {
      return { success: false, error: "Failed to initiate Google sign in" }
    }
  }
}
