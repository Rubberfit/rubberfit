import type { AuthError, AuthResponse, Session, Subscription, User } from "@supabase/supabase-js"

export interface IAuthService {
  signIn(email: string, password: string): Promise<AuthResponse>
  signUp(email: string, password: string): Promise<AuthResponse>
  signOut(): Promise<{ error: AuthError | null }>
  resetPassword(email: string): Promise<{ error: AuthError | null }>
  updatePassword(password: string): Promise<AuthResponse>
  getCurrentUser(): Promise<User | null>
  getSession(): Promise<Session | null>
  onAuthStateChange(callback: (user: User | null) => void): Subscription
}
