# general/\_components/

Per-section components for the General settings page.

| File                         | Purpose                                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `organization-section.tsx`   | Tenant details — company name (required), legal name. Local scaffold; org write wiring still deferred.                        |
| `regional-section.tsx`       | Language + currency + time zone + date format. Server-backed via `updateUserPreferences`. Live previews per picker.           |
| `operations-section.tsx`     | Unit system + low-stock threshold. Side-by-side imperial⇄metric reference card; threshold display switches with unit system. |
| `format-saved-hint.ts`       | Shared helper that formats the "last saved" caption.                                                                          |

`regional-section.tsx` and `operations-section.tsx` are **client
components driven by server-resolved props**: the page server-fetches
`getUserPreferences()` and passes `{ preferences }` down. Every
authenticated user has their own row (auto-provisioned by a trigger on
`profiles` INSERT); RLS at the DB enforces "you can only touch your
own row" so no admin gate is needed at the action layer.

Locale-change-on-save additionally calls the `setLocale` server action
to update the `NEXT_LOCALE` cookie + `router.refresh()` so the
dashboard chrome (avatar menu locale checkmark, page copy) picks up
the new bundle immediately.

The avatar menu's locale switcher (in `app/dashboard/_components/sidebar/nav-user.tsx`)
calls the same `updateUserPreferences` action so changes propagate
between the two surfaces.
