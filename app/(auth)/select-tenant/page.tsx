import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { sanitizeRedirectPath } from "@/app/lib/auth-redirect"
import { ACTIVE_TENANT_COOKIE } from "@/app/server/auth/active-tenant"
import { ensureDatabaseFactoryRegistered } from "@/app/server/database/register-factory"
import { listAccessibleTenants } from "@/src/infrastructure/services/active-tenant.service"
import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"

import { TenantChooser } from "./_components/tenant-chooser"

interface SelectTenantPageProps {
  searchParams?:
    | Promise<{ redirectTo?: string | string[] }>
    | { redirectTo?: string | string[] }
}

export default async function SelectTenantPage({ searchParams }: SelectTenantPageProps) {
  ensureDatabaseFactoryRegistered()
  const client = await getDatabaseClient()

  const {
    data: { user },
  } = await client.auth.getUser()
  // Proxy gates this path for authenticated traffic only; a missing
  // user here means the cookie was stripped mid-render. Bounce to
  // /login defensively.
  if (!user) redirect("/login")

  const tenants = await listAccessibleTenants(client, user.id)

  const cookieStore = await cookies()
  const currentTenantId = cookieStore.get(ACTIVE_TENANT_COOKIE)?.value ?? null

  const resolvedSearchParams = await Promise.resolve(searchParams)
  const rawRedirect = Array.isArray(resolvedSearchParams?.redirectTo)
    ? resolvedSearchParams.redirectTo[0]
    : resolvedSearchParams?.redirectTo
  const redirectTo = sanitizeRedirectPath(rawRedirect) ?? "/dashboard"

  return (
    <div>
      <span className="auth-eyebrow">Workspace selection</span>
      <h1 className="auth-heading">Choose your workspace.</h1>
      <p className="text-sm text-muted-foreground">
        {tenants.length === 0
          ? "You don't have access to any workspaces yet."
          : "Pick the workspace you want to act in. You can switch any time."}
      </p>

      <TenantChooser
        tenants={tenants}
        currentTenantId={currentTenantId}
        redirectTo={redirectTo}
      />
    </div>
  )
}
