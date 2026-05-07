"use client"

import { PageHeader, PageShell } from "@/app/components/patterns"

import { OperationsSection } from "./_components/operations-section"
import { OrganizationSection } from "./_components/organization-section"
import { RegionalSection } from "./_components/regional-section"

/**
 * General settings — Phase 2 PR 2.
 *
 * Three sections, each owning its own draft / baseline / saved-at
 * state. Per-section Save / Cancel + Sonner toast confirmation,
 * driven by the new `app/components/ui/forms/` primitives.
 *
 * State is in-memory scaffold today (no backend service); per-section
 * save handlers fire `toast.success` and lock in the section's
 * "last saved" marker so the row collapses back to a clean state.
 * Wiring to the real org-settings service is a follow-up task.
 *
 * See `docs/superpowers/specs/2026-05-06-dashboard-phase2-design.md` §4.
 */
export default function GeneralSettingsPage() {
  return (
    <PageShell variant="form">
      <PageHeader
        crumbs={[{ label: "Settings", href: "/dashboard/settings" }, { label: "General" }]}
        title="General"
        subtitle="Organization, regional, and operational defaults applied across the workspace."
      />

      <div className="mx-auto w-full max-w-2xl space-y-10 pb-20">
        <OrganizationSection isFirst />
        <RegionalSection />
        <OperationsSection />
      </div>
    </PageShell>
  )
}
