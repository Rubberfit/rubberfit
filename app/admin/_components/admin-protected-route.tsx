"use client"
import { useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/app/contexts/AuthContext"
import { Spinner } from "@/app/components/ui/spinner"

//const ADMIN_EMAIL_DOMAIN = "@archandanchor.com"

const SPINNER_TIMEOUT_MS = 8000

function isAdminAuthorized(email: string, isSuperAdmin: boolean | undefined): boolean {
  //TO BE IMPLEMENTED LATER: email.endsWith(ADMIN_EMAIL_DOMAIN) &&
  return isSuperAdmin === true
}

export function AdminProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [spinnerTimedOut, setSpinnerTimedOut] = useState(false)

  // Backstop: if AuthContext's bootstrap timeout doesn't fire, force-
  // redirect to /login rather than leaving an admin user on a
  // permanent spinner. Mirrors ProtectedRoute's backstop.
  useEffect(() => {
    if (!loading) return
    const timer = setTimeout(() => setSpinnerTimedOut(true), SPINNER_TIMEOUT_MS)
    return () => {
      clearTimeout(timer)
      setSpinnerTimedOut(false)
    }
  }, [loading])

  useEffect(() => {
    if (loading && spinnerTimedOut) {
      router.replace("/login")
      return
    }
    if (loading) return
    if (!user || !isAdminAuthorized(user.email, user.isSuperAdmin)) {
        console.log(user?.email, user?.isSuperAdmin)
        router.replace("/unauthorized")
    }
  }, [user, loading, router, spinnerTimedOut])

  if (loading && !spinnerTimedOut) {
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
