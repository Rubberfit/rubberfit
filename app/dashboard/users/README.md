# users/

Admin-only `/dashboard/users` surface — gated on
`useRole().isAdmin`. Real-wired against
`userManagementService` (Supabase): list / create / update /
deactivate / reactivate. Self-deactivation is blocked at the row
button level (`disabled={isSelf}`).

## Files

- **page.tsx** -- Page chrome + filter row + table + modal/dialog
  orchestration. Phase 2 PR 4 chrome: `<PageHeader>` with the
  `Invite user` primary action, search input + role select +
  status select filter row, `<DataTable>`-backed table.
- **\_components/users-table.tsx** -- `<DataTable>` wrapper with
  sortable Name / Roles / Status / Last sign-in / Joined columns
  and per-row Edit / Deactivate / Reactivate actions. Roles
  render as token-based `<StatusBadge>` chips intent-mapped per
  role; status uses `success` / `neutral`. Empty state offers an
  `Invite user` CTA.
- **\_components/user-form-modal.tsx** -- shadcn `<Dialog>`
  create/edit form. Retains its Phase 1 chrome — restyle is a
  separate follow-up because the form body is large and merits
  its own review surface.
- **\_components/deactivate-user-dialog.tsx** -- `<AlertDialog>`
  confirm for the destructive action.

## Out of scope (PR 4)

- **Bulk action bar** — the spec §4 calls for a sticky bar that
  appears when `selectedCount > 0`. Adding selection state would
  also require corresponding bulk endpoints in
  `userManagementService` (no bulk-deactivate / bulk-role-change
  exists today). Tracked for the S6 wiring task.
- **Invite-only flow** — the modal currently doubles as
  create/edit; the spec describes a slimmer Invite modal (email +
  role + optional message). The richer existing modal is closer
  to what admins use day-to-day, so the Phase 2 chrome update
  doesn't replace it.
