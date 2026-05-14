import { getTranslations } from "next-intl/server"

import { resolveUseCase } from "@/di/resolve"
import { TOKENS } from "@/di/tokens"
import type { IOrganizationService } from "@/src/application/services/organization.service.interface"
import { buildFallbackOrganizationPreferences } from "@/src/infrastructure/models/organization-preferences"

import { PageHeader, PageShell } from "@/app/components/patterns"
import { getOrganizationPreferences } from "@/app/actions/organization-preferences"
import { getUserPreferences } from "@/app/actions/user-preferences"
import { requireAuthenticatedUser } from "@/app/server/auth/require-authenticated-user"
import { ensureDatabaseFactoryRegistered } from "@/app/server/database/register-factory"

import { OperationsSection } from "./_components/operations-section"
import { OrganizationSection } from "./_components/organization-section"
import { RegionalSection } from "./_components/regional-section"

/**
 * General settings.
 *
 * Per the 2026-05-14 operator-seeds-prints ruling, this page hosts
 * two preference tiers in one surface:
 *
 *   - <OrganizationSection> — workspace defaults (locale, currency,
 *     time zone, date format, unit system, low-stock threshold).
 *     Governs PDFs, billing dates, emails, shared seeds. Owner/admin
 *     edit; member read-only (today members can't reach this page
 *     because of the `manageUsers` route gate, but the section
 *     accepts `isAdmin` so the future member-visible case is a
 *     single prop change away).
 *
 *   - <RegionalSection> + <OperationsSection> — personal display
 *     overrides for the viewer's own dashboard UI only. Print/export
 *     pipelines ignore these per the ruling.
 */
export default async function GeneralSettingsPage() {
  ensureDatabaseFactoryRegistered()
  const t = await getTranslations("settings.general")
  const actor = await requireAuthenticatedUser()
  const organizationService = resolveUseCase<IOrganizationService>(TOKENS.IOrganizationService)

  const [userPreferencesResult, organizationPreferencesResult, organization] = await Promise.all([
    getUserPreferences(),
    getOrganizationPreferences(),
    organizationService.getCurrentOrganizationForUser(actor.id),
  ])

  if ("error" in userPreferencesResult) {
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

  const { data: userPreferences } = userPreferencesResult

  // Org prefs may surface `not_provisioned` / `no_organization` — both
  // fall back to canonical defaults so the section still renders. The
  // admin pickers will write the first real row on save.
  const organizationPreferences =
    "data" in organizationPreferencesResult
      ? organizationPreferencesResult.data
      : buildFallbackOrganizationPreferences(organization?.id ?? "")

  const role = organization
    ? await organizationService.getMemberRole(organization.id, actor.id)
    : null
  const isAdmin = role === "owner" || role === "admin"

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
          <OrganizationSection preferences={organizationPreferences} isAdmin={isAdmin} isFirst />
          <RegionalSection preferences={userPreferences} />
          <OperationsSection preferences={userPreferences} />
        </div>
      </div>
    </PageShell>
  )
}
