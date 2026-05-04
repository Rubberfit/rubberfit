# patterns/

Shared UX pattern library built on shadcn primitives in `../ui/`.
If a component renders in more than one page, it either lives
here or it's a shadcn primitive. No per-page re-invention.

All pattern components reference Task 1 design tokens in
`app/globals.css`. No raw palette colors; everything routes
through semantic roles (surface / text / border / success /
warning / danger / info).

## Components (Task 2a — shipped)

| Component          | Purpose                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `PageShell`        | Max-width page wrapper with variants (overview / dense / form) and vertical rhythm.      |
| `PageHeader`       | Title + subtitle + breadcrumbs + actions slot. H1 scale, muted subtitle.                 |
| `StatCard`         | KPI tile. Tabular-number value, optional unit, inline trend delta, optional sparkline.   |
| `StatusBadge`      | Intent-coloured status chip (success / warning / danger / info / accent / neutral).      |
| `StatusDot`        | Standalone colored dot for compact list rows.                                            |
| `InlineNotice`     | Page-level informational banner with intent + optional actions. Not a toast.             |
| `resolveErrorCopy` | Machine-code → tailored copy registry for `ErrorState` / `InlineNotice` consumers.       |

## Components (Task 2b — shipped)

| Component           | Purpose                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| `EmptyState`        | Empty-state banner with four variants (blank / informational / educational / guide) + CTAs.      |
| `LoadingCard`       | Skeleton card shaped to match the real card (title, rows, optional metric rows).                 |
| `LoadingTable`      | Table skeleton with configurable columns, row count, and density (compact / comfortable).        |
| `ErrorState`        | Full-card error surface; consumes the machine-code registry for tailored copy + CTA.             |
| `EntityRow`         | Standard list row: icon + primary + secondary + metadata + trailing actions; link- or button-backed. |
| `ActivityFeedRow`   | Timeline feed row with vertical guide line, icon, actor copy, timestamp.                         |

## Components (Task 2c — shipped)

| Component         | Purpose                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| `ViewToolbar`     | Search + filter chips + actions row above list surfaces.                                                |
| `DetailPanel`     | Right-side drawer for object detail. Three size presets. Header/content/footer slots.                   |
| `DataTable`       | Styled wrapper around `ui/table.tsx`. Sort indicators, density, row click, loading skeleton, empty slot. |
| `useTableSort`    | Controlled sort state helper.                                                                           |
| `useTableFilter`  | Client-side filter with a predicate factory.                                                            |
| `useTableDensity` | Density (compact / comfortable) state helper.                                                           |

No TanStack Table dependency is introduced. Server-side
pagination and faceted filters are out of scope until a
surface demonstrates the need.

## Components (S5 A0.4 — shipped)

| Component          | Purpose                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| `WorkspaceColumn`  | Column primitive for three-column editor surfaces. `column: "left" \| "center" \| "right"` picks width (fixed ~320 / fluid / fixed ~340). `scroll: "y"` opts into vertical overflow for panel content. |
| `WorkspaceRow`     | Horizontal wrapper holding three `WorkspaceColumn` children. Owns the column gap + responsive collapse behaviour in one place.                                                                         |

`PageShell` gained a `workspace` variant (no max-width, no
container chrome, fills the viewport). Cutting engine and any
future three-column editor surface (free-roam CAD, side-by-side
viewers) use these together:

```tsx
<PageShell variant="workspace">
  <WorkspaceRow>
    <WorkspaceColumn column="left" scroll="y">{/* parts queue */}</WorkspaceColumn>
    <WorkspaceColumn column="center">{/* Konva stage */}</WorkspaceColumn>
    <WorkspaceColumn column="right" scroll="y">{/* strategy + results */}</WorkspaceColumn>
  </WorkspaceRow>
</PageShell>
```

## Error code registry

Service layers that return structured `{ code, message }` errors
register the code in `error-codes.ts`. `ErrorState` and
`InlineNotice` look up the copy + intent + action label by code
so each call site doesn't re-implement the switch.

Add a new entry in `error-codes.ts` first; then the consuming UI
just passes the code and gets the right copy + CTA.
