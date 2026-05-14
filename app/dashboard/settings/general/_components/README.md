# general/\_components/

Per-section components for the General settings page.

| File                         | Purpose                                                                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `organization-section.tsx`   | Tenant details — company name (required), legal name. Local scaffold; org write wiring still deferred.                             |
| `regional-section.tsx`       | Language + currency + time zone + date format. Server-backed via `updateOrganizationPreferences`. Live previews per picker.        |
| `operations-section.tsx`     | Unit system + low-stock threshold. Side-by-side imperial⇄metric reference card; threshold display switches with the unit system.   |
| `workspace-scope-strip.tsx`  | Hairline scope-cue chrome above the sections (`WORKSPACE DEFAULT` for admins, `PERSONAL OVERRIDE` for members).                    |
| `format-saved-hint.ts`       | Shared helper that formats the "last saved" caption.                                                                               |

`regional-section.tsx` and `operations-section.tsx` are **client
components driven by server-resolved props**: the page server-fetches
`getOrganizationPreferences()` and passes `{ preferences, isAdmin }`
down. Non-admins see disabled controls + the read-only label; the
admin save flow calls `updateOrganizationPreferences()` server action,
which goes through the `IOrganizationPreferencesService` singleton.

Locale-change-on-save additionally calls the `setLocale` server action
to update the `NEXT_LOCALE` cookie so subsequent renders pick up the
new bundle.
