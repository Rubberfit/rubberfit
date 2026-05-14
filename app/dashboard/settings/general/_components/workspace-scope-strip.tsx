"use client"

import { useTranslations } from "next-intl"

type WorkspaceScopeStripProps = {
  isAdmin: boolean
}

export function WorkspaceScopeStrip({ isAdmin }: WorkspaceScopeStripProps) {
  const t = useTranslations("settings.general.scope")
  return (
    <div className="border border-[var(--color-rule)] bg-[var(--color-surface-raised)] px-5 py-3 mb-8 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.22em] text-[var(--color-ink)]">
          {isAdmin ? t("workspaceDefault") : t("personalOverride")}
        </span>
        <span className="font-[family-name:var(--font-sans)] text-[13px] text-[var(--color-ink-soft)]">
          {isAdmin ? t("workspaceDefaultClause") : t("personalOverrideClause")}
        </span>
      </div>
      {!isAdmin && (
        <button
          type="button"
          disabled
          title="Available in a future update."
          className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink)] hover:underline underline-offset-4 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          {t("reset")}
        </button>
      )}
    </div>
  )
}
