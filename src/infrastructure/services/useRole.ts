import { useEffect, useRef, useState } from "react"
import { supabase } from "@/src/infrastructure/models/supabase"
import { DEFAULT_ROLES, type AppRole, type Permission } from "@/src/application/permissions"
import {
  hasAnyRole as hasAnyRoleForRoles,
  hasPermission,
} from "@/src/infrastructure/services/permissionService"

// Hook return type
export interface UseRoleReturn {
  roles: AppRole[] // all roles the user holds
  isLoading: boolean
  userId: string | null
  email: string | null
  fullName: string | null
  // Convenience role checks
  isAdmin: boolean
  isCutter: boolean
  isManager: boolean
  isSupervisor: boolean
  isMember: boolean
  isViewer: boolean
  // Permission checker — returns true if user has ANY role for that action
  can: (permission: Permission) => boolean
  // Check a custom list of roles on the fly
  hasAnyRole: (required: AppRole[]) => boolean
}

// Hook
export function useRole(): UseRoleReturn {
  const [roles, setRoles] = useState<AppRole[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [fullName, setFullName] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const hasLoaded = useRef(false)

  useEffect(() => {
    let mounted = true

    const fetchRoles = async () => {
      if (!hasLoaded.current) setIsLoading(true)
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (!session?.user) {
          if (mounted) {
            setRoles([])
            setUserId(null)
            setEmail(null)
            setFullName(null)
            hasLoaded.current = true
            setIsLoading(false)
          }
          return
        }

        // Roles live on memberships now (per-tenant). The hook returns
        // the union of roles across all active memberships so existing
        // permission checks (which still assume one flat role list)
        // keep working until `activeTenantId` is wired into the actor
        // and roles become per-tenant.
        const [profileResult, membershipsResult] = await Promise.all([
          supabase
            .from("profiles")
            .select("full_name, email, is_platform_admin")
            .eq("id", session.user.id)
            .maybeSingle(),
          supabase
            .from("memberships")
            .select("roles")
            .eq("profile_id", session.user.id)
            .is("deleted_at", null),
        ])

        if (!mounted) return

        const profile = profileResult.data
        const memberships = membershipsResult.data ?? []
        const isPlatformAdmin = profile?.is_platform_admin === true
        const hasNoActiveMemberships = memberships.length === 0

        if (!profile || (hasNoActiveMemberships && !isPlatformAdmin)) {
          // Inaccessible account — no profile, or no active memberships
          // and not a platform admin. Sign out so RLS-scoped reads on
          // downstream pages don't quietly return empty results.
          await supabase.auth.signOut()
          return
        }

        const rolesUnion = new Set<string>()
        for (const row of memberships) {
          for (const role of row.roles ?? []) {
            rolesUnion.add(role)
          }
        }
        const resolvedRoles =
          rolesUnion.size > 0 ? (Array.from(rolesUnion) as AppRole[]) : [...DEFAULT_ROLES]

        setRoles(resolvedRoles)
        setFullName(profile.full_name ?? null)
        setEmail(profile.email ?? session.user.email ?? null)
        setUserId(session.user.id)
        hasLoaded.current = true
        setIsLoading(false)
      } catch (err) {
        console.error("[useRole] Failed to fetch roles:", err)
        if (mounted) {
          setRoles([...DEFAULT_ROLES])
          hasLoaded.current = true
          setIsLoading(false)
        }
      }
    }

    fetchRoles()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      // Defer to a fresh task so we don't call back into Supabase
      // (`getSession` / `from(profiles)`) while the auth state-change
      // pipeline is still holding the GoTrue init lock — same deadlock
      // shape that wedged the /mfa-challenge form on cold OAuth loads.
      setTimeout(() => {
        fetchRoles()
      }, 0)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  // ANY match helper
  const hasAnyRole = (required: AppRole[]) => hasAnyRoleForRoles(roles, required)

  // Permission checker
  const can = (permission: Permission): boolean => hasPermission(roles, permission)

  return {
    roles,
    isLoading,
    userId,
    email,
    fullName,
    isAdmin: roles.includes("admin"),
    isCutter: hasAnyRole(["cutter", "admin"]),
    isManager: hasAnyRole(["manager", "admin"]),
    isSupervisor: hasAnyRole(["supervisor", "admin"]),
    isMember: roles.includes("member"),
    isViewer: roles.includes("viewer"),
    can,
    hasAnyRole,
  }
}
