import { getTranslations } from "next-intl/server"

import { PageHeader, PageShell } from "@/app/components/patterns"
import { getOrganizationPreferences } from "@/app/actions/organization-preferences"

import { OperationsSection } from "./_components/operations-section"
import { OrganizationSection } from "./_components/organization-section"
import { RegionalSection } from "./_components/regional-section"
import { WorkspaceScopeStrip } from "./_components/workspace-scope-strip"

/**
 * General settings — PR 1 of the settings + i18n rollout.
 *
 * Server Component that hydrates the page with the caller's org
 * preferences row + their admin flag, then defers picker UI to the
 * section client components. The next-intl client provider wraps the
 * tree at the root layout, so client components below pick up
 * `useTranslations` directly.
 *
 * Non-admin lane (read-only views + disabled controls) is rendered
 * for completeness even though personal-override writes ship in a
 * follow-up PR — the chrome already signals scope, and the
 * `Reset to workspace default` button is intentionally disabled.
 *
 * Source-of-truth scoping doc:
 * .claude/handoff/codex-result-settings-i18n-scope-2026-05-13.md
 */
export default async function GeneralSettingsPage() {
  const t = await getTranslations("settings.general")
  const result = await getOrganizationPreferences()

  if ("error" in result) {
    return (
      <PageShell variant="form">
        <PageHeader
          crumbs={[{ label: "Settings", href: "/dashboard/settings" }, { label: t("pageTitle") }]}
          title={t("pageTitle")}
          subtitle={t("pageSubtitle")}
        />
        <div className="mx-auto w-full max-w-2xl pb-20">
          <p className="font-[family-name:var(--font-sans)] text-[14px] text-[var(--color-ink-soft)]">
            No workspace is attached to this account. Complete onboarding to set preferences.
          </p>
        </div>
      </PageShell>
    )
  }

  const { data: preferences, isAdmin } = result

  return (
    <PageShell variant="form">
      <PageHeader
        crumbs={[{ label: "Settings", href: "/dashboard/settings" }, { label: t("pageTitle") }]}
        title={t("pageTitle")}
        subtitle={t("pageSubtitle")}
      />

      <div className="mx-auto w-full max-w-2xl pb-20">
        <WorkspaceScopeStrip isAdmin={isAdmin} />
        <div className="space-y-10">
          <OrganizationSection isFirst />
          <RegionalSection preferences={preferences} isAdmin={isAdmin} />
          <OperationsSection preferences={preferences} isAdmin={isAdmin} />
        </div>
      </div>
    </PageShell>
  )
}
