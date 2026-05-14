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
  buildFallbackOrganizationPreferences,
  type OrganizationPreferences,
} from "@/src/infrastructure/models/organization-preferences"

/**
 * Organization-level preferences (locale, currency, timeZone,
 * dateFormat, unitSystem, lowStockThresholdSqft) made available to
 * every client subtree under `/dashboard/*`.
 *
 * Per the 2026-05-14 operator-seeds-prints ruling, these govern any
 * shared/printed surface — PDFs, billing dates, customer-facing
 * artifacts — even when the viewing user has their own per-user row
 * with different values. Personal screen display still flows through
 * the sibling `<UserPreferencesProvider>` (`useUserPreferences()`).
 *
 * Mounted in `app/dashboard/layout.tsx` after a server-side fetch
 * via `getOrganizationPreferences()`. When the provision trigger
 * hasn't created the row yet, the layout passes
 * `DEFAULT_ORGANIZATION_PREFERENCES` so the rest of the dashboard
 * renders with sane defaults instead of crashing on a missing row.
 *
 * `setOrganizationPreferences` is exposed so the admin org-defaults
 * settings section can update context optimistically after a save —
 * keeps any PDF the user immediately prints in sync with the new
 * value without waiting for `router.refresh()` to land.
 */
interface OrganizationPreferencesContextValue {
  preferences: OrganizationPreferences
  setOrganizationPreferences: (next: OrganizationPreferences) => void
}

const OrganizationPreferencesContext = createContext<OrganizationPreferencesContextValue | null>(
  null
)

interface OrganizationPreferencesProviderProps {
  initialPreferences: OrganizationPreferences
  children: ReactNode
}

export function OrganizationPreferencesProvider({
  initialPreferences,
  children,
}: OrganizationPreferencesProviderProps) {
  const [preferences, setPreferencesState] = useState<OrganizationPreferences>(initialPreferences)
  // Re-sync from the server when `router.refresh()` reaches the
  // dashboard layout with fresh preferences. Compare by
  // (organizationId, updatedAt) so identity churn from parent re-renders
  // doesn't trigger an unnecessary state update. Mirror of the
  // user-preferences-provider pattern.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreferencesState((current) =>
      current.organizationId === initialPreferences.organizationId &&
      current.updatedAt === initialPreferences.updatedAt
        ? current
        : initialPreferences
    )
  }, [initialPreferences])
  const setOrganizationPreferences = useCallback(
    (next: OrganizationPreferences) => setPreferencesState(next),
    []
  )
  const value = useMemo<OrganizationPreferencesContextValue>(
    () => ({ preferences, setOrganizationPreferences }),
    [preferences, setOrganizationPreferences]
  )
  return (
    <OrganizationPreferencesContext.Provider value={value}>
      {children}
    </OrganizationPreferencesContext.Provider>
  )
}

/**
 * Reads the active organization's preferences. Falls back to
 * canonical defaults if used outside the provider so a mistakenly
 * mounted dashboard component doesn't crash — but the intent is to
 * always render under the provider.
 */
export function useOrganizationPreferences(): OrganizationPreferences {
  const ctx = useContext(OrganizationPreferencesContext)
  return ctx?.preferences ?? buildFallbackOrganizationPreferences()
}

/**
 * Returns `setOrganizationPreferences` so the org-defaults settings
 * section can propagate a save into the dashboard context
 * immediately. Throws if called outside the provider — saves
 * shouldn't silently drop.
 */
export function useSetOrganizationPreferences(): (next: OrganizationPreferences) => void {
  const ctx = useContext(OrganizationPreferencesContext)
  if (!ctx) {
    throw new Error(
      "useSetOrganizationPreferences must be used inside <OrganizationPreferencesProvider>"
    )
  }
  return ctx.setOrganizationPreferences
}
