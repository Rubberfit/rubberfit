# general/\_components/

Per-section components for the General settings page.

Per the 2026-05-14 operator-seeds-prints ruling, this page hosts two
preference tiers in one surface:

- **Workspace defaults** — govern PDFs, billing dates, emails, and
  the seeds for new shared records. Owner/admin edit; member
  read-only. Persisted to `organization_preferences`.
- **Personal display overrides** — apply only to the viewer's own
  dashboard UI. Print/export pipelines ignore these. Persisted to
  `user_preferences`.

| File                       | Purpose                                                                                                                                                                                                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `organization-section.tsx` | **Workspace defaults editor.** Locale, currency, time zone, date format, unit system, low-stock threshold. Server-backed via `updateOrganizationPreferences`. Owner/admin only; selects disabled (`!isAdmin`) for any future member-visible surface. RLS at DB is the second guard. |
| `regional-section.tsx`     | **Personal regional display.** Language + currency + time zone + date format for the viewer's own dashboard UI. Server-backed via `updateUserPreferences`. Live previews per picker.                                                                                                |
| `operations-section.tsx`   | **Personal unit display.** Unit system only (canvas + UI rendering). The low-stock threshold moved to the workspace section in PR 2c (operator-seeds-prints ruling — it's a shared seed, not a personal display preference).                                                        |
| `format-saved-hint.ts`     | Shared helper that formats the "last saved" caption.                                                                                                                                                                                                                                |

All three section components are **client components driven by
server-resolved props**: the page server-fetches both
`getUserPreferences()` and `getOrganizationPreferences()` (plus the
caller's `getMemberRole`) and passes `{ preferences, isAdmin }` down.

- `updateUserPreferences` requires no admin gate — every user owns
  their own row, enforced by RLS at the DB.
- `updateOrganizationPreferences` is owner/admin-gated at the action
  layer (via `organizationService.getMemberRole`); RLS at the DB
  enforces the same rule as defense in depth.

Locale-change-on-save in `regional-section.tsx` additionally calls
the `setLocale` server action to update the `NEXT_LOCALE` cookie +
`router.refresh()` so the dashboard chrome (avatar menu locale
checkmark, page copy) picks up the new bundle immediately. The
workspace-section save calls `useSetOrganizationPreferences()` to
propagate the new row into the dashboard provider so any subsequent
PDF download picks it up without a navigation.

The avatar menu's locale switcher (in
`app/dashboard/_components/sidebar/nav-user.tsx`) still calls
`updateUserPreferences` — locale is a personal screen preference,
unaffected by the workspace section.
