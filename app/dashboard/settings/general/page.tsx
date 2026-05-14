import { getTranslations } from "next-intl/server"

import { PageHeader, PageShell } from "@/app/components/patterns"
import { getUserPreferences } from "@/app/actions/user-preferences"

import { OperationsSection } from "./_components/operations-section"
import { OrganizationSection } from "./_components/organization-section"
import { RegionalSection } from "./_components/regional-section"

/**
 * General settings — per-user preferences for locale + display +
 * operational defaults. Any operator controls their own row, no
 * admin gate. The `organization_preferences` table still exists for
 * a future "workspace defaults" admin surface, but reads/writes on
 * this page flow through user_preferences.
 *
 * Source-of-truth scoping doc:
 * .claude/handoff/codex-result-settings-i18n-scope-2026-05-13.md
 */
export default async function GeneralSettingsPage() {
  const t = await getTranslations("settings.general")
  const result = await getUserPreferences()

  if ("error" in result) {
    return (
      <PageShell variant="form">
        <PageHeader
          crumbs={[
            { label: t("breadcrumbSettings"), href: "/dashboard/settings" },
            { label: t("pageTitle") },
          ]}
          title={t("pageTitle")}
          subtitle={t("pageSubtitle")}
        />
        <div className="mx-auto w-full max-w-2xl pb-20">
          <p className="font-[family-name:var(--font-sans)] text-[14px] text-[var(--color-ink-soft)]">
            {t("notProvisioned")}
          </p>
        </div>
      </PageShell>
    )
  }

  const { data: preferences } = result

  return (
    <PageShell variant="form">
      <PageHeader
        crumbs={[
          { label: t("breadcrumbSettings"), href: "/dashboard/settings" },
          { label: t("pageTitle") },
        ]}
        title={t("pageTitle")}
        subtitle={t("pageSubtitle")}
      />

      <div className="mx-auto w-full max-w-2xl pb-20">
        <div className="space-y-10">
          <OrganizationSection isFirst />
          <RegionalSection preferences={preferences} />
          <OperationsSection preferences={preferences} />
        </div>
      </div>
    </PageShell>
  )
}
