"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import {
  buildFallbackUserPreferences,
  type UserPreferences,
} from "@/src/infrastructure/models/user-preferences"

/**
 * Per-user preferences (locale, currency, timeZone, dateFormat,
 * unitSystem, lowStockThresholdSqft) made available to every client
 * subtree under `/dashboard/*`.
 *
 * The provider is mounted in `app/dashboard/layout.tsx` after a
 * server-side fetch via `getUserPreferences()`. When the trigger
 * hasn't auto-provisioned a row yet, the layout passes
 * `DEFAULT_USER_PREFERENCES` so the rest of the dashboard renders
 * with sane defaults instead of hitting an undefined-context branch.
 *
 * `setPreferences` is exposed so settings sections can update the
 * context optimistically after a save — keeps the avatar menu's
 * locale checkmark + dashboard date formatting in sync without
 * waiting for a router.refresh() to land.
 */
interface UserPreferencesContextValue {
  preferences: UserPreferences
  setPreferences: (next: UserPreferences) => void
}

const UserPreferencesContext = createContext<UserPreferencesContextValue | null>(null)

interface UserPreferencesProviderProps {
  initialPreferences: UserPreferences
  children: ReactNode
}

export function UserPreferencesProvider({
  initialPreferences,
  children,
}: UserPreferencesProviderProps) {
  const [preferences, setPreferencesState] = useState<UserPreferences>(initialPreferences)
  // Re-sync from the server when `router.refresh()` reaches the
  // dashboard layout with fresh preferences — without this, a save
  // in /dashboard/settings/general updates the DB but the avatar
  // menu + every other surface keeps rendering the cached snapshot
  // until the next full nav. Compare by `updatedAt` so identity
  // changes from re-renders don't cause an unnecessary state churn.
  useEffect(() => {
    setPreferencesState((current) =>
      current.updatedAt === initialPreferences.updatedAt &&
      current.userId === initialPreferences.userId
        ? current
        : initialPreferences
    )
  }, [initialPreferences])
  const setPreferences = useCallback((next: UserPreferences) => setPreferencesState(next), [])
  const value = useMemo<UserPreferencesContextValue>(
    () => ({ preferences, setPreferences }),
    [preferences, setPreferences]
  )
  return <UserPreferencesContext.Provider value={value}>{children}</UserPreferencesContext.Provider>
}

/**
 * Reads the current user's preferences. Falls back to canonical
 * defaults if used outside the provider so a mistakenly-mounted
 * dashboard component doesn't crash — but the intent is to always
 * render under the provider.
 */
export function useUserPreferences(): UserPreferences {
  const ctx = useContext(UserPreferencesContext)
  return ctx?.preferences ?? buildFallbackUserPreferences()
}

/**
 * Returns `setPreferences` so callers (settings sections) can
 * propagate a save into the dashboard context immediately. Throws if
 * called outside the provider — saves shouldn't silently drop.
 */
export function useSetUserPreferences(): (next: UserPreferences) => void {
  const ctx = useContext(UserPreferencesContext)
  if (!ctx) {
    throw new Error("useSetUserPreferences must be used inside <UserPreferencesProvider>")
  }
  return ctx.setPreferences
}
