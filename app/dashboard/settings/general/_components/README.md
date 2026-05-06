# general/\_components/

Per-section components for the General settings page (Phase 2 PR 2).
Each section owns its own draft / baseline / saved-at state and
fires its own Sonner toast on save. Splitting them out keeps the
page-level component under the project's `max-lines-per-function`
threshold and keeps each section's dirty-state logic local.

| File                       | Purpose                                               |
| -------------------------- | ----------------------------------------------------- |
| `organization-section.tsx` | Tenant details — company name (required), legal name. |
| `regional-section.tsx`     | Currency, time zone, date format.                     |
| `operations-section.tsx`   | Default unit system + low-stock threshold.            |
| `format-saved-hint.ts`     | Shared helper that formats the "last saved" caption.  |

State is in-memory scaffold today; the real org-settings service
wiring is deferred to a follow-up task.
