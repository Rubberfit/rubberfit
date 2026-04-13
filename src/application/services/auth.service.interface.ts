import type { AuthError, Session, Subscription } from "@supabase/supabase-js"

export interface AuthUser {
  id: string
  email: string
  name?: string
  avatar?: string
  roles: string[]
  authProvider?: string
  createdAt: string
}

export interface AuthResponse {
  user: AuthUser | null
  error: AuthError | null
}

export interface IAuthService {
  signIn(email: string, password: string): Promise<AuthResponse>
  signUp(email: string, password: string): Promise<AuthResponse>
  signOut(): Promise<{ error: AuthError | null }>
  resetPassword(email: string): Promise<{ error: AuthError | null }>
  updatePassword(password: string): Promise<AuthResponse>
  getCurrentUser(): Promise<AuthUser | null>
  getSession(): Promise<Session | null>
  onAuthStateChange(callback: (user: AuthUser | null) => void): {
    data: { subscription: Subscription }
  }
}
