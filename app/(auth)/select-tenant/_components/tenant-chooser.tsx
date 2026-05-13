"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { selectTenant } from "@/app/actions/active-tenant"
import { Button } from "@/app/components/ui/button"
import type { AccessibleTenant } from "@/src/infrastructure/services/active-tenant.service"

interface TenantChooserProps {
  tenants: AccessibleTenant[]
  currentTenantId: string | null
  redirectTo: string
}

export function TenantChooser({ tenants, currentTenantId, redirectTo }: TenantChooserProps) {
  const router = useRouter()
  const [pendingTenantId, setPendingTenantId] = useState<string | null>(null)

  if (tenants.length === 0) {
    return (
      <div className="mt-6 rounded-md border border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
        <p className="mb-2 font-medium text-foreground">No workspaces available.</p>
        <p>
          Ask an administrator to invite you to a workspace, then return here. If you
          believe this is an error, contact{" "}
          <span className="font-medium text-foreground">support@arcandanchor.com</span>.
        </p>
      </div>
    )
  }

  const handleSelect = async (tenantId: string) => {
    if (pendingTenantId) return
    setPendingTenantId(tenantId)
    try {
      await selectTenant({ tenantId })
      router.push(redirectTo)
      router.refresh()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not switch workspace"
      toast.error("Could not switch workspace", { description: message })
      setPendingTenantId(null)
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-2">
      {tenants.map((tenant) => {
        const isCurrent = tenant.tenantId === currentTenantId
        const isPending = pendingTenantId === tenant.tenantId
        return (
          <button
            key={tenant.tenantId}
            type="button"
            onClick={() => handleSelect(tenant.tenantId)}
            disabled={pendingTenantId !== null}
            className="flex w-full items-center justify-between gap-4 rounded-md border border-border bg-background px-4 py-3 text-left transition-colors hover:border-foreground/30 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-base font-medium text-foreground">
                  {tenant.name}
                </span>
                {isCurrent ? (
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    Current
                  </span>
                ) : null}
              </div>
              <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                {tenant.slug}
              </div>
              {tenant.roles.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {tenant.roles.map((role) => (
                    <span
                      key={role}
                      className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
                    >
                      {role}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {isPending ? "Switching…" : "Open →"}
            </span>
          </button>
        )
      })}

      <div className="mt-4 text-xs text-muted-foreground">
        Want a different workspace?{" "}
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          onClick={() => router.push("/login?error=Sign+in+again+to+switch+accounts")}
        >
          Sign in with a different account
        </Button>
      </div>
    </div>
  )
}
