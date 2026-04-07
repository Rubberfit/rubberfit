"use client"

import { useEffect, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { canAccessPath, getDefaultAuthorizedPath } from "@/lib/rbac"
import { Spinner } from "@/components/ui/spinner"

interface ProtectedRouteProps {
  children: ReactNode
  fallback?: ReactNode
}

export function ProtectedRoute({ children, fallback }: ProtectedRouteProps) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth/v2/login")
      return
    }

    if (!loading && user && !canAccessPath(user.roles, pathname)) {
      router.replace(getDefaultAuthorizedPath(user.roles))
    }
  }, [user, loading, pathname, router])

  // Show loading spinner while checking authentication
  if (loading || (user && !canAccessPath(user.roles, pathname))) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Spinner className="h-8 w-8" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  // If not authenticated, show fallback or nothing (redirect will happen)
  if (!user) {
    return fallback || null
  }

  // If authenticated, render the protected content
  return <>{children}</>
}
