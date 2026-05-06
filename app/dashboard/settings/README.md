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
**Phase 2 PR 2a:** General sub-page rebuilt with the new `forms/` primitives — sectioned `<FormSectionHeader>` + per-section `<FormActions>` save/cancel + Sonner toast confirmation.
**Phase 2 PR 2b:** Profile sub-page rebuilt — Personal info + Password + Two-factor + Account information + Danger-zone Delete sections all sitting on the new `<FormFieldset>` chrome.
**Phase 2 PR 3 (this commit):** Materials moves to `<DataTable>` + right-side `<Sheet>` drawer for Add/Edit (replacing the per-row card layout and Add `<Dialog>`); Notifications rebuilt as three sections (Thresholds / Channels / Quiet hours) with Push and SMS rendered disabled with `Coming soon` badges. Users + Security come in PR 4.

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
- **profile/** -- Personal info + password + two-factor + account
  metadata + danger-zone Delete account, all on the Phase 2
  `<FormFieldset>` chrome. Auth-context wiring (avatar upload,
  password change via `auth.updatePassword`, MFA enrollment via
  `authMfaService`, soft-delete via `profileService.requestSelfDelete`)
  is unchanged from S4 Task 10 — only the visual chrome moved
  from shadcn `<Card>` to the Phase 2 primitives.
- **materials/** -- Phase 2 `<DataTable>` of material types with a
  right-side `<Sheet>` drawer for Add/Edit and a destructive
  `<AlertDialog>` for delete (FK-protected via `rollService` +
  `purchaseOrderService` checks). Wired against `materialTypeService`
  — same Supabase calls used in S4 Task 10.
- **notifications/** -- Phase 2 sectioned form (Thresholds / Channels /
  Quiet hours). Push + SMS rows render disabled with `Coming soon`.
  State is local-only; backend wiring to `notification_preferences`
  is deferred to S6 tech-debt pass.
