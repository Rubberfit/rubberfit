"use client"

import { Shield } from "lucide-react"

import { useRole } from "@/src/infrastructure/services/useRole"
import { PageHeader, PageShell } from "@/app/components/patterns"

import { AccessPolicySection } from "./_components/access-policy-section"
import { AuditLogSection } from "./_components/audit-log-section"
import { MetricsHero } from "./_components/metrics-hero"
import { RolesMatrixSection } from "./_components/roles-matrix-section"

/**
 * Admin Security & Audit — Phase 2 PR 5.
 *
 * Sits at `/dashboard/admin/security` (not `/dashboard/security`,
 * which is the customer-facing Trust & Security page). Admin-gated
 * via `useRole().isAdmin`. Surfaces:
 *
 *   - Hero — 4 `<StatCard>`s (sessions / MFA% / events 7d / failed
 *     logins).
 *   - Access policy — MFA-required switch + session timeout select.
 *   - Roles & permissions — read-only matrix derived from the
 *     canonical `PERMISSIONS` map.
 *   - Audit log — `<DataTable>` with severity dot column.
 *
 * Every value on this page is mock today, gated by the
 * `TODO(ARC-DASHBOARD-AUDIT)` markers in
 * `_components/mock-data.ts`. Backend wiring (sessions table, MFA
 * enforcement flag, real `audit_log`) is a separate S6 task.
 *
 * See `docs/superpowers/specs/2026-05-06-dashboard-phase2-design.md` §4.
 */
export default function AdminSecurityPage() {
  const { isAdmin, isLoading: isRoleLoading } = useRole()

  if (isRoleLoading) {
    return null
  }

  if (!isAdmin) {
    return (
      <PageShell variant="overview">
        <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-3 py-20 text-center">
          <Shield className="size-10 text-muted-foreground" aria-hidden="true" />
          <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
            Access restricted
          </h2>
          <p className="text-sm text-muted-foreground">
            Only admins can view security policy and the audit log.
          </p>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell variant="form">
      <PageHeader
        crumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Admin" },
          { label: "Security" },
        ]}
        title="Security & Audit"
        subtitle="Access policy, role permissions, and the tenant audit trail."
      />

      <div className="mt-6 space-y-10">
        <MetricsHero />
        <AccessPolicySection />
        <RolesMatrixSection />
        <AuditLogSection />
      </div>
    </PageShell>
  )
}
