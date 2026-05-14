import { getTranslations } from "next-intl/server"

import { resolveUseCase } from "@/di/resolve"
import { TOKENS } from "@/di/tokens"
import type { IOrganizationService } from "@/src/application/services/organization.service.interface"
import { buildFallbackOrganizationPreferences } from "@/src/infrastructure/models/organization-preferences"

import { InlineNotice, PageHeader, PageShell } from "@/app/components/patterns"
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

  // Org prefs may surface `not_provisioned` / `no_organization`. Fall
  // back to canonical defaults for display, but track the missing-row
  // case explicitly so the editor can render read-only — the RLS
  // policy is UPDATE-only (INSERT is trigger-driven), so a save
  // against a non-existent row would fail. In practice the trigger +
  // backfill in migration 20260514000001 covers every org; this guard
  // is for the edge case where that invariant ever breaks.
  const organizationPreferences =
    "data" in organizationPreferencesResult
      ? organizationPreferencesResult.data
      : buildFallbackOrganizationPreferences(organization?.id ?? "")
  const organizationPreferencesProvisioned = "data" in organizationPreferencesResult

  const role = organization
    ? await organizationService.getMemberRole(organization.id, actor.id)
    : null
  const isAdmin = role === "owner" || role === "admin"
  // Only enable the editor when the row actually exists AND the caller
  // is an admin. A "phantom" editor for a missing-row case would let
  // the user click Save into an action that can only ever UPDATE.
  const canEditOrgDefaults = isAdmin && organizationPreferencesProvisioned

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
          {isAdmin && !organizationPreferencesProvisioned ? (
            <InlineNotice intent="warning" title={t("orgNotProvisionedTitle")}>
              {t("orgNotProvisionedBody")}
            </InlineNotice>
          ) : null}
          <OrganizationSection
            preferences={organizationPreferences}
            isAdmin={canEditOrgDefaults}
            isFirst
          />
          <RegionalSection preferences={userPreferences} />
          <OperationsSection preferences={userPreferences} />
        </div>
      </div>
    </PageShell>
  )
}
