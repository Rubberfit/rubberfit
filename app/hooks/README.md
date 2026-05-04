# hooks/

App-wide React hooks. Part of the S4 Task 4 two-tier
colocation rule:

| Scope                                 | Location                                       |
| ------------------------------------- | ---------------------------------------------- |
| Page-local (used by one surface only) | `app/dashboard/<surface>/_components/use-*.ts` |
| App-wide (multiple surfaces or cross-cutting concerns) | `app/hooks/use-*.ts` |

A domain tier (`<surface>/_hooks/`) is **not** introduced. If a
surface grows to more than five shared hooks, revisit. Until
then, two tiers is enough and prevents the "tiers of hooks"
drift S4 Task 4 cleaned up.

## Files

- **use-mobile.ts** — `useIsMobile()` hook that listens to a
  media query breakpoint (768px) and returns whether the
  viewport is mobile-sized.
- **use-cut-history-analytics.ts** — `useCutHistoryAnalytics(from, to)`
  feature hook that fetches cut-history records from the Rust
  analytics endpoint. Consumed by the `/usage`, `/costs`, and
  `/trends` analytics surfaces. Expected to fold into the
  consolidated `/dashboard/analytics/` surface in Task 9 and
  become page-local there; the app-wide tier is its temporary
  home while those three routes remain distinct.
- **use-regenerate-cut-pdf.ts** — `useRegenerateCutPdf()` hook
  shared by the cut history table (`app/dashboard/history/`) and
  the job detail drawer's cuts panel (`app/dashboard/jobs/`).
  Wraps the `POST /api/cuts/history/[id]/pdf` recovery endpoint
  (issue #127) with per-cut pending tracking via `Set<string>`
  and unified toast/error handling, so concurrent regenerations
  across surfaces stay isolated and consistent.
