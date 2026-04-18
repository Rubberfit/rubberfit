"use client"
import { useEffect, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/app/contexts/AuthContext"
import { Spinner } from "@/app/components/ui/spinner"

const ADMIN_EMAIL_DOMAIN = "@archandanchor.com"

function isAdminAuthorized(email: string, isSuperAdmin: boolean | undefined): boolean {
  return email.endsWith(ADMIN_EMAIL_DOMAIN) && isSuperAdmin === true
}

export function AdminProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!user || !isAdminAuthorized(user.email, user.isSuperAdmin)) {
        console.log(user?.email, user?.isSuperAdmin)
        router.replace("/unauthorized")
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Spinner className="h-8 w-8" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user || !isAdminAuthorized(user.email, user.isSuperAdmin)) {
    return null
  }

  return <>{children}</>
}
