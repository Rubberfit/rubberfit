"use client"

import { useEffect, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/app/contexts/AuthContext"
import { canAccessPath } from "@/app/lib/rbac"
import { Spinner } from "@/app/components/ui/spinner"

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
      router.replace("/login")
      return
    }

    if (!loading && user && !canAccessPath(user.roles, pathname)) {
      router.replace("/status-pages/unauthorized")
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
