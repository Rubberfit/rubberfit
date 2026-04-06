# contexts/

React context providers for app-wide shared state.

## Files

- **AuthContext.tsx** -- AuthProvider and `useAuth()` hook. Manages the current user session, listens to Supabase auth state changes, and provides user/loading state to the component tree.

```typescript
interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  signIn: (email: string, password: string, redirectTo?: string | null) => Promise<{ success: boolean; error?: string }>
  signUp: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>
  updatePassword: (password: string) => Promise<{ success: boolean; error?: string; redirectTo?: string }>
  signInWithGoogle: (redirectTo?: string | null) => Promise<{ success: boolean; error?: string }>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) throw new Error("useAuth must be used within an AuthProvider")
  return context
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  // On mount: fetches current user via authService.getCurrentUser()
  // Subscribes to auth state changes via authService.onAuthStateChange()
  // Memoizes action functions from auth-actions.ts
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Usage:
// const { user, loading, signIn, signOut } = useAuth()
// if (loading) return <Spinner />
// if (!user) return <LoginPage />
```

- **auth-actions.ts** -- Factory functions for auth operations (signIn, signUp, signOut, resetPassword, updatePassword, signInWithGoogle).

```typescript
// Each function is a factory that returns an async action, closing over setUser/setLoading/router:

export function createSignIn(setUser: SetUser, setLoading: SetLoading, router: AppRouterInstance) {
  return async (
    email: string,
    password: string,
    redirectTo?: string | null
  ): Promise<AuthResult> => {
    setLoading(true)
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
    // ...
  }
}

export function createSignInWithGoogle() {
  return async (redirectTo?: string | null): Promise<AuthResult> => {
    const callbackUrl = new URL(getBrowserAppUrl("/auth/v2/callback"))
    const safeRedirect = sanitizeRedirectPath(redirectTo)
    if (safeRedirect) callbackUrl.searchParams.set("next", safeRedirect)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl.toString(), scopes: "openid email profile ..." },
    })
    // ...
  }
}

// Also exports: createSignUp, createSignOut, createResetPassword, createUpdatePassword
```
