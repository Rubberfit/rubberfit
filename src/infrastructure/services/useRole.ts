import { useEffect, useState } from "react"
import { supabase } from "@/src/infrastructure/models/supabase-context"
import { DEFAULT_ROLES, type AppRole, type Permission } from "@/src/application/permissions"
import {
  hasAnyRole as hasAnyRoleForRoles,
  hasPermission,
} from "@/src/infrastructure/services/permissionService"
import { getUserRoles } from "@/src/infrastructure/services/getUserRoles"

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

  useEffect(() => {
    let mounted = true

    const fetchRoles = async () => {
      setIsLoading(true)
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
            setIsLoading(false)
          }
          return
        }

        const [resolvedRoles, { data: profile }] = await Promise.all([
          getUserRoles(supabase, session.user.id),
          supabase
            .from("profiles")
            .select("full_name, email")
            .eq("id", session.user.id)
            .maybeSingle(),
        ])

        if (mounted) {
          setRoles(resolvedRoles.length > 0 ? resolvedRoles : [...DEFAULT_ROLES])
          setFullName(profile?.full_name ?? null)
          setEmail(profile?.email ?? session.user.email ?? null)
          setUserId(session.user.id)
          setIsLoading(false)
        }
      } catch (err) {
        console.error("[useRole] Failed to fetch roles:", err)
        if (mounted) {
          setRoles([...DEFAULT_ROLES])
          setIsLoading(false)
        }
      }
    }

    fetchRoles()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      fetchRoles()
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
