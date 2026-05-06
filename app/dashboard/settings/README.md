# settings/

Consolidated settings surface (S4 Task 10). Tabbed layout with
four sub-routes under `/dashboard/settings/*`:

| Tab           | Route                     | What                                                                                             |
| ------------- | ------------------------- | ------------------------------------------------------------------------------------------------ |
| General       | `/settings/general`       | Company, timezone, currency, inventory thresholds, cutting defaults, system settings             |
| Profile       | `/settings/profile`       | Profile info, avatar, password, account metadata (absorbed the prior `/dashboard/account` route) |
| Materials     | `/settings/materials`     | Material-type configuration + stock alert thresholds                                             |
| Notifications | `/settings/notifications` | In-app feed + email dispatch preferences + quiet hours                                           |

**Phase 2 PR 1:** mono uppercase underlined tab strip (replaces the Phase 1 `bg-muted` chip strip).
**Phase 2 PR 2 (this commit):** General sub-page rebuilt with the new `forms/` primitives — sectioned `<FormSectionHeader>` + per-section `<FormActions>` save/cancel + Sonner toast confirmation. Profile is in flight as PR 2b. Materials + Notifications restyle is PR 3; Users + Security come in PR 4.

See `docs/superpowers/specs/2026-05-06-dashboard-phase2-design.md` for the locked design and `app/components/ui/forms/README.md` for the new primitives.

`/dashboard/settings` root redirects to `/settings/general`.

`/dashboard/account` 308 → `/settings/profile` via
`next.config.mjs`. The nav-user menu and account switcher now
push directly to the new path.

The **delivered-notifications feed** (`/dashboard/notifications`)
stays separate — it's the operator-facing inbox. The
Notifications tab here is preferences only.

## Files

- **layout.tsx** -- Shared tab-strip shell rendered above every
  sub-page. Click-to-router.push keeps URL as canonical state.
- **page.tsx** -- Root redirect to `/settings/general`.

## Subdirectories

- **general/** -- Phase 2 sectioned form using `app/components/ui/forms/` primitives. Per-section Save/Cancel + Sonner toast. State is in-memory scaffold today; backend wiring is a follow-up task.
- **profile/** -- ProfileCard + SecurityCard + MfaCard +
  AccountInfoCard + DeleteAccountCard (moved from the removed
  `/dashboard/account` in S4 Task 10). Self-serve account deletion
  lives at the bottom as a danger-zone card; soft-deletes via
  `profiles.is_deleted` and signs the user out. The callback /
  login paths reject deleted profiles.
- **materials/** -- Material-type configuration surface (existing).
- **notifications/** -- Preferences stub. Backend wiring to
  `notification_preferences` deferred to S6 tech-debt pass.
