# analytics/

Consolidated Analytics surface (S4 Task 9). Six previously
top-level routes collapsed under this parent so operators see one
nav entry and a single tab strip instead of six separate pages.

Pre-S4 URLs (`/dashboard/waste`, `/dashboard/usage`, etc.)
permanent-redirect (HTTP 308) into this subtree via
`next.config.mjs`. Bookmarks and external deep links keep
working.

## Files

- **layout.tsx** -- Shared tab-strip shell rendered above every
  sub-page. Tab clicks `router.push` the target route so the URL
  stays the canonical state (deep link, refresh, and browser
  back/forward all work). Sticky on scroll.
- **page.tsx** -- Root redirects to the first sub-tab
  (`/analytics/waste`) so `/dashboard/analytics` resolves to a
  usable surface.

## Subdirectories

- **waste/** -- Waste analysis: per-material waste, date-range
  filter, trend chart.
- **waste-comparison/** -- Side-by-side waste comparison across
  two configurable periods.
- **usage/** -- Material usage tracking: distribution + tables.
- **costs/** -- Cost analysis: breakdown + trend + monthly cost
  tables.
- **trends/** -- Multi-metric trend analysis with seasonal
  patterns and key insights.
- **reports/** -- Report generation from saved templates.

Each sub-page still owns its `PageShell` + `PageHeader` and its
own data-fetching logic — Task 9 kept the existing internals
intact and just added the parent route + shared layout. Later
polish (shared data-fetch layer, summary tab, unified filter
state) lands in post-S4 work.
