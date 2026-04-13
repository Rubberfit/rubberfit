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
} from "./auth-actions"

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  signIn: (
    email: string,
    password: string,
    redirectTo?: string | null
  ) => Promise<{ success: boolean; error?: string }>
  signUp: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>
  updatePassword: (
    password: string
  ) => Promise<{ success: boolean; error?: string; redirectTo?: string }>
  signInWithGoogle: (redirectTo?: string | null) => Promise<{ success: boolean; error?: string }>
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
    const getInitialUser = async () => {
      try {
        const currentUser = await authService.getCurrentUser()
        setUser(currentUser)
      } catch (error) {
        console.error("Error getting initial user:", error)
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    getInitialUser()

    const {
      data: { subscription },
    } = authService.onAuthStateChange((authUser) => {
      setUser(authUser)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = useMemo(() => createSignIn(setUser, setLoading, router), [router])
  const signUp = useMemo(() => createSignUp(setUser, setLoading), [])
  const signOut = useMemo(() => createSignOut(setUser, setLoading, router), [router])
  const resetPassword = useMemo(() => createResetPassword(), [])
  const updatePassword = useMemo(() => createUpdatePassword(setUser, setLoading), [])
  const signInWithGoogle = useMemo(() => createSignInWithGoogle(), [])

  const value: AuthContextType = {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
    signInWithGoogle,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
