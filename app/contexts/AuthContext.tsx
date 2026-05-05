"use client"

import "reflect-metadata"
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react"

import { useRouter } from "next/navigation"

import { type AuthUser, authService } from "@/src/infrastructure/services/authService"
import {
  createSignIn,
  createSignUp,
  createSignOut,
  createResetPassword,
  createUpdatePassword,
  createSignInWithGoogle,
  createCompleteMfaChallenge,
  type SignInResult,
} from "./auth-actions"

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  signIn: (
    email: string,
    password: string,
    redirectTo?: string | null
  ) => Promise<SignInResult>
  signUp: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>
  updatePassword: (
    password: string
  ) => Promise<{ success: boolean; error?: string; redirectTo?: string }>
  signInWithGoogle: (redirectTo?: string | null) => Promise<{ success: boolean; error?: string }>
  /**
   * Completes a login-time MFA challenge. Called by the login form's
   * code-entry step after `signIn` returns `mfaRequired: true`.
   */
  completeMfaChallenge: (
    factorId: string,
    code: string,
    redirectTo?: string | null
  ) => Promise<{ success: boolean; error?: string }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    let cancelled = false

    // Backstop: if Supabase never fires INITIAL_SESSION (network
    // failure, init bug, etc.), bail out of the spinner after 5s and
    // treat as unauthenticated. Better to redirect to /login than to
    // hold every protected route on a permanent spinner.
    const BOOTSTRAP_TIMEOUT_MS = 5000
    const timeoutId = setTimeout(() => {
      if (cancelled) return
      setUser(null)
      setLoading(false)
    }, BOOTSTRAP_TIMEOUT_MS)

    // authService.onAuthStateChange now handles INITIAL_SESSION,
    // SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED, and
    // PASSWORD_RECOVERY — every event that affects the AuthUser the
    // app cares about. The subscription is the single source of truth.
    const {
      data: { subscription },
    } = authService.onAuthStateChange((authUser) => {
      if (cancelled) return
      clearTimeout(timeoutId)
      setUser(authUser)
      setLoading(false)
    })

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
      subscription.unsubscribe()
    }
  }, [])

  const signIn = useMemo(() => createSignIn(setUser, setLoading, router), [router])
  const signUp = useMemo(() => createSignUp(setUser, setLoading), [])
  const signOut = useMemo(() => createSignOut(setUser, setLoading, router), [router])
  const resetPassword = useMemo(() => createResetPassword(), [])
  const updatePassword = useMemo(() => createUpdatePassword(setUser, setLoading), [])
  const signInWithGoogle = useMemo(() => createSignInWithGoogle(), [])
  const completeMfaChallenge = useMemo(
    () => createCompleteMfaChallenge(setUser, setLoading, router),
    [router]
  )

  const value: AuthContextType = {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
    signInWithGoogle,
    completeMfaChallenge,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
