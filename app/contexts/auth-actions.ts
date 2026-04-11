import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime"

import { getBrowserAppUrl } from "@/app/lib/app-url"
import { resolvePostAuthRedirect, sanitizeRedirectPath } from "@/app/lib/auth-redirect"
import { supabase } from "@/app/lib/supabase"
import { type AuthUser, authService } from "@/src/infrastructure/services/authService"

type AuthResult = { success: boolean; error?: string }
type SetUser = (user: AuthUser | null) => void
type SetLoading = (loading: boolean) => void

export function createSignIn(setUser: SetUser, setLoading: SetLoading, router: AppRouterInstance) {
  return async (
    email: string,
    password: string,
    redirectTo?: string | null
  ): Promise<AuthResult> => {
    setLoading(true)
    try {
      const { user: authUser, error } = await authService.signIn(email, password)

      if (error) {
        setLoading(false)
        return { success: false, error: error.message }
      }

      if (authUser) {
        setUser(authUser)
        router.push(resolvePostAuthRedirect(authUser.roles, redirectTo))
        return { success: true }
      }

      setLoading(false)
      return { success: false, error: "Authentication failed" }
    } catch (error) {
      setLoading(false)
      return {
        success: false,
        error: error instanceof Error ? error.message : "An unexpected error occurred",
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
      const callbackUrl = new URL(getBrowserAppUrl("/auth/v2/callback"))
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
