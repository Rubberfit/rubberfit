# Dashboard refactor — full roadmap (Phases 1 → 5)

**Status:** in flight. Phases 1 + 1b + 2 shipped; Phase 3 PRs 3a–3d shipped (3d on PR #194 merged 2026-05-07); 3e–3j pending. Phase 4 + 5 not started.
**Date:** 2026-05-07
**Scope:** dashboard UI restyle — does not include the Rust engine work tracked under S1–S5 in `2026-04-17-migration-overview-design.md`.

This document is the single source of truth for the dashboard refactor's phase plan, the locked design system, file inventory of completed work, remaining work per phase, and the workflow template + gotchas accumulated along the way.

## 1. Phase map

| Phase        | Scope                                                                                                                                       | Status                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Phase 1**  | App shell + dashboard landing chrome                                                                                                        | shipped (#179)                                 |
| **Phase 1b** | Dashboard landing card chrome polish                                                                                                        | shipped (#180)                                 |
| **Phase 2**  | Settings (General/Profile/Materials/Notifications) + Users admin + Admin Security & Audit + form primitives                                 | shipped (#182–#187)                            |
| **Phase 3**  | Inventory hub end-to-end (rolls, POs, reorder, materials, import)                                                                           | in flight — 3a/3b/3c/3d shipped; 3e–3j pending |
| **Phase 4**  | Untouched non-engine surfaces (analytics / history / jobs / notifications feed / customer trust / settings landing / cutting-engine chrome) | not started                                    |
| **Phase 5**  | Konva canvas redesign (cutting engine visualizer itself)                                                                                    | not started — sequenced after Phase 4          |

## 2. Locked design system

These primitives are the building blocks for every phase from here on. Don't freelance new chrome — extend or compose these.

### Page chrome (Phase 1b — `app/dashboard/_components/`)

- `<PageShell variant="form|dense|overview">` — consistent gutter / max-width / vertical rhythm.
- `<PageHeader crumbs title subtitle actions>` — page title bar with breadcrumbs + action slot.
- `<ViewToolbar searchValue searchPlaceholder onSearchChange filters>` — list-page search + filter bar.
- `<StatCard label value icon trend footnote>` — number-on-card hero element.
- `<StatusBadge>` / `<StatusDot>` — workflow state pills with neutral "Unknown" fallback.
- `<EmptyState>` — list/table empty hero.
- `<DataTable columns rows rowKey sort onSortChange>` + `useTableSort` — tabular surface w/ pluggable sort.
- `<InlineNotice intent title>` — info / warning / error inline banners.
- `<TablePagination>` — paginator footer (currently in `app/dashboard/inventory/_components/`; promote to global when a 3rd consumer appears).

### Form primitives (Phase 2 — `app/components/ui/forms`)

- `<FormFieldset>` / `<FormSectionHeader>`
- `<FormField>` — alias to `FormFieldShell` locally to dodge the shadcn-RHF name clash.
- `<FormFieldGroup>` / `<FormFieldRow>`
- `<FormActions hideCancel>`

### Surface conventions

- **List + drawer:** `<DataTable>` + right `<Sheet>` keyed on row id (e.g. `<RollDetailDrawer>`, `<PoViewDrawer>`).
- **Create/edit small entity:** Right `<Sheet>` with body keyed on target identity (e.g. `<RollFormSheet>`).
- **Create/edit big multi-section form:** Full-page route w/ `<PageShell variant="form">` + sticky footer (e.g. `/purchase-orders/new`, `/[id]/edit`).
- **Per-section dirty state:** `draft / baseline / savedAt` triple + Sonner toast confirmation (Phase 2 settings pattern).
- **Server actions:** Use the arc-147 actions in `app/actions/<domain>.ts`. Each does `requireAuthenticatedUser` + `requirePermission` + Zod parse + `resolveUseCase` + `revalidatePath`. Form submits never call SDKs directly anymore.

### Visual tokens

Signal-orange `#ee5a24` (`text-primary`), mill paper `#f6f5f2`, Inkwell `#14171b`. WCAG AA — orange-on-mill fails small text; error text stays Inkwell with orange icon. Tailwind v4 utilities only.

## 3. Phase 3 PR map

| PR  | Scope                                                                         | Status        |
| --- | ----------------------------------------------------------------------------- | ------------- |
| 3a  | Inventory hub: StatCards + Tools dropdown + `<DataTable>` migration           | merged (#188) |
| 3b  | Roll detail drawer + roll create/edit `<Sheet>`                               | merged (#189) |
| 3c  | PO list + view drawer                                                         | merged (#193) |
| 3d  | PO full-page create/edit routes                                               | merged (#194) |
| 3e  | Reorder workbench (sections + suggestions DataTable + sticky bulk action bar) | next          |
| 3f  | Reorder rule sheet (right `<Sheet>` keyed body)                               | not started   |
| 3g  | Materials types + overview tightening                                         | not started   |
| 3h  | Materials suppliers (the 22-component subtree)                                | not started   |
| 3i  | Materials pricing (table + chart wrapper restyle)                             | not started   |
| 3j  | Import route polish                                                           | not started   |

### Phase 3 file inventory of completed work

**Inventory hub (3a):**

- `app/dashboard/inventory/page.tsx` — StatsHero + Tools dropdown + DataTable wrapping
- `app/dashboard/inventory/_components/inventory-stats-hero.tsx` — 4-card hero
- `app/dashboard/inventory/_components/use-inventory-stats.ts` — fetcher hook
- `app/dashboard/inventory/_components/inventory-table.tsx` — DataTable consumer
- `app/dashboard/inventory/_components/use-inventory-columns.tsx` — column registry
- `app/dashboard/inventory/_components/use-paged-rolls.ts` — sort + paginate hook
- `app/dashboard/inventory/_components/table-pagination.tsx` — shared paginator footer
- `app/dashboard/inventory/_components/destructive-roll-action-dialog.tsx`

**Roll detail + form (3b):**

- `app/dashboard/inventory/_components/roll-detail-drawer.tsx` — slim shell
- `app/dashboard/inventory/_components/roll-detail-body.tsx` — keyed body
- `app/dashboard/inventory/_components/roll-detail-{meta,offcuts,usage}.tsx`
- `app/dashboard/inventory/_components/roll-form-sheet.tsx` — Sheet replacing the dialog
- `app/dashboard/inventory/_components/roll-form-fields.tsx` — Phase 2 primitives
- `app/dashboard/inventory/_components/roll-form-schema.ts` — zod schema

**Purchase orders (3c + 3d):**

- `app/dashboard/inventory/purchase-orders/page.tsx` — list, drawer wiring, navigation
- `app/dashboard/inventory/purchase-orders/_components/po-table.tsx` — DataTable + filters
- `app/dashboard/inventory/purchase-orders/_components/use-po-columns.tsx` — column registry + memoized `<PoActionsCell>`
- `app/dashboard/inventory/purchase-orders/_components/po-status-badge.tsx` — neutral "Unknown" fallback
- `app/dashboard/inventory/purchase-orders/_components/po-view-drawer.tsx` — read-only Sheet shell
- `app/dashboard/inventory/purchase-orders/_components/po-view-body.tsx` — body w/ `isSubmitting` gate
- `app/dashboard/inventory/purchase-orders/new/page.tsx` — create route + JobPrefillBridge inline
- `app/dashboard/inventory/purchase-orders/[id]/edit/page.tsx` — edit route
- `app/dashboard/inventory/purchase-orders/_components/po-form-shell.tsx` — page chrome (sticky footer)
- `app/dashboard/inventory/purchase-orders/_components/po-form-sections.tsx` — `Po*Card` sections
- `app/dashboard/inventory/purchase-orders/_components/po-form-dialog.ts` — `POFormData` + `POFormItem` w/ `client_id` + `getEmptyItem()`
- `usePurchaseOrders` / `usePOActions` — trimmed to view-drawer + status transitions only

**Tests:** `tests/dashboard/{inventory,roll-form-sheet,roll-detail-drawer,po-view-drawer,po-new-page}.test.tsx` + `tests/dashboard/use-paged-rolls.test.tsx`. 75 total dashboard tests.

### Phase 3 remaining (3e–3j)

**3e — Reorder workbench.** `app/dashboard/inventory/reorder/page.tsx` (399 lines). Kill the `Rules | Suggestions | Analytics` tab strip → scroll-anchored sections (Settings Phase 2 pattern). Suggestions list → `<DataTable>` with row-level selection state. Sticky bulk action bar when `selectedCount > 0` (includes "Create POs in batch"). StatCard hero already exists in `reorder-stats-cards.tsx`.

**3f — Reorder rule sheet.** Replace `reorder-rule-modal.tsx` with right `<Sheet>` + Phase 2 form primitives. Body keyed on target identity. Schema lifts to its own module like `roll-form-schema.ts`.

**3g — Materials types + overview.** `app/dashboard/inventory/materials/page.tsx` (171) + `materials/types/page.tsx`. Tighten the overview hub; types page → DataTable + sheet CRUD, mirror the rolls pattern.

**3h — Materials suppliers** (biggest slice). `materials/suppliers/page.tsx` + 22 `_components/`. Supplier list → DataTable. Detail → right Sheet. Create/edit → form sheet. **Carry-over:** schema change to store `supplier_id` instead of denormalized `supplier` name on `Roll` (queued from PR 3b's CR finding on supplier-resolution race) — needs API + DB change.

**3i — Materials pricing.** `materials/pricing/page.tsx` + 7 `_components/`. Page chrome alignment. Charts (recharts) keep their internals; only the wrappers restyle.

**3j — Import route polish.** `inventory/import/page.tsx` — keep the route per the Phase 3 synthesis fork pick (CSV review needs full width). Three-step card sequence (Template → Upload → Review) keeps its shape, just chrome alignment.

## 4. Phase 4 candidates (untouched non-engine surfaces)

Each is a separate PR slot. Spec drafted via dual sign-off (Kimi K2.6 + Codex) on a per-surface basis when the phase opens.

| Surface               | Path                                                                                                          | Notes                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Analytics suite       | `app/dashboard/analytics/page.tsx` + `analytics/{waste,waste-comparison,usage,costs,trends,reports}/page.tsx` | 7 pages total. Mostly chart wrappers around `<StatCard>` / `<PageHeader>` chrome. Recharts internals stay.                                                                                               |
| Cut history           | `app/dashboard/history/page.tsx`                                                                              | Natural `<DataTable>` target — list of past cuts. Drawer for cut detail.                                                                                                                                 |
| Jobs                  | `app/dashboard/jobs/page.tsx`                                                                                 | Job receipt list. Drawer for job detail (links to PO via `?job_id=`).                                                                                                                                    |
| Notifications feed    | `app/dashboard/notifications/page.tsx`                                                                        | In-app feed (distinct from `/settings/notifications`). Reads from the `notifications` table — see CLAUDE.md "Notifications gotcha" section.                                                              |
| Customer trust page   | `app/dashboard/security/page.tsx`                                                                             | Procurement-facing FAQ + trust signals + DPA contact. Visual polish only — content stays cite-grounded. NOT the admin Security & Audit page (that's Phase 2 PR 5, lives at `/dashboard/admin/security`). |
| Settings landing      | `app/dashboard/settings/page.tsx`                                                                             | Index page above the four settings tabs. Probably becomes a tile grid linking each settings sub-page.                                                                                                    |
| Cutting-engine chrome | `app/dashboard/cutting-engine/page.tsx` + `cutting-engine/free-roam/page.tsx`                                 | The page header / sidebar / control chrome around the Konva canvas. The canvas itself is Phase 5.                                                                                                        |

## 5. Phase 5 — Konva canvas

The cutting engine visualizer (`<NestingVisualizer>`, the StockSheet renderer, the part overlays). Spec not yet drafted. When this phase opens, brief Kimi K2.6 (design taste) + DeepSeek-v4-pro (algorithm/geometry — see workspace `CLAUDE.md` model routing) since the canvas crosses both UI and `rf-layout` / `jagua-rs` internals.

## 6. Carried-over deferred items (4)

Span Phase 3 + 4 cleanup. Pick up opportunistically alongside in-flight PRs.

1. **UserFormModal restyle** — 538-line modal punted from Phase 2 PR 4. Has a pre-existing React 19 `set-state-in-effect` lint at line 529.
2. **Bulk action bar on Users page** — selection state + bulk endpoints in `userManagementService` (parallels the bulk bar shipping in Phase 3 PR 3e for Reorder).
3. **Materials archive copy flip** — flip "Delete" → "Archive/Restore" once the soft-delete migration lands. Tracked in code as `TODO(ARC-DASHBOARD-MATERIALS-ARCHIVE)`.
4. **Backend wiring of TODO markers** — `TODO(ARC-DASHBOARD-AUDIT)` (sessions table, MFA enforcement flag, real `audit_log`) + `TODO(ARC-DASHBOARD-INVENTORY)` (low-stock count from reorder-suggestions service). Grep finds them; need DB + API work, not pure UI.

## 7. Per-PR workflow template

1. `git fetch origin && git checkout -B feat/dashboard-phase<N>-<slug> origin/dev`
2. **Survey** the existing files in scope (read pages + components, identify pre-Phase-2 vs already-modernized).
3. **Brief route depending on scope:**
   - Heavy UI design (new layout, new chrome): brief Kimi K2.6 + Codex in parallel for dual sign-off → founder approves forks → Kimi writes the TSX → Claude integrates.
   - Mechanical refactor with established patterns (PR 3c+3d level): write directly using known primitives, justify the skip on Kimi briefing in the commit.
4. **Run gates:** `npm run typecheck` → `npx vitest run tests/dashboard/` → `npx eslint <touched> --max-warnings=0` → `npx prettier --write` → `coderabbit review --plain -t uncommitted`.
5. Commit + push + open PR (target dev).
6. Address CR findings in rounds; founder merges; loop.

## 8. Common gotchas (accumulated across Phases 2 + 3)

These bit at least once during the work — keep them in mind when resuming.

- **DataTable cell signature:** `cell: (row, index) => ReactNode`. Row is the data, NOT `{ row: { original: T } }` (TanStack-style).
- **`useTableSort` returns a tuple** like `useState`: `const [sort, setSort] = useTableSort({...})`.
- **Phase 2 `<FormField>` collides with shadcn's RHF `<FormField>`** — alias the Phase 2 import to `FormFieldShell` locally.
- **React 19 `set-state-in-effect` rule fires on `app/`** even though `npm run lint` doesn't lint `app/` (CI scope: `src/ nesting/ di/ config/ proxy.ts`). Direct eslint runs catch it. For unavoidable cases (scan effects, fetch-then-set), use `/* eslint-disable react-hooks/set-state-in-effect */` block disable around the effect — single-line directives don't always cover the inner `setState` line.
- **Sheet's built-in X close button** has accessible name "Close" so `getByRole("button", {name: /Close/})` matches BOTH the X and the footer Close. Use `getAllByRole(...).pop()` or add a `data-testid`.
- **Stub Radix DropdownMenu in tests** — Radix portals + happy-dom is flaky; inline-mock to render trigger + items in-place. See `tests/dashboard/inventory-page.test.tsx` for the pattern. Same trick works for Radix Select.
- **Don't double-toast on status transitions** — `updatePOStatus` (in `use-po-actions.ts`) owns the toast. Anyone calling it (drawer Submit, row dropdown) should NOT toast on top. The function returns `Promise<boolean>` so callers can gate `onClose()` on success.
- **`POFormItem.client_id`** — generated on add via module-level counter. Use as React key for line-item rows; survives reorder/remove. Stripped by `mapFormItems` before forwarding to the server action.
- **`async` button onClick handlers** need a `try/catch` — `try/finally` alone leaks unhandled rejections through the React event boundary. See `po-view-body.tsx::handleSubmitClick`.
- **Async cancellation flag** — name as `isCancelled` (not `cancelled`) per the boolean-prefix rule. Pass as `signal: { isCancelled: boolean }` from the effect into the fetch callback so setState short-circuits on unmount.
- **`<Button asChild disabled>` doesn't actually disable a `<Link>` child** — anchors ignore the prop. Conditionally render a non-anchor button when you need to gate navigation (see `po-form-shell.tsx`'s mid-save Cancel).
- **`?? !value` ≠ `|| !value`** — empty string is falsy but not nullish, so `loadError ?? !po` flows past `loadError === ""`. Use explicit `loadError !== null && loadError !== ""` when both nullish AND empty need to be handled.
- **`<a href>` vs Next.js `<Link>`** in `<DropdownMenuItem asChild>` — use `<Link>` for in-app nav so the prefetcher sees it.
- **`getStatusBadge` fallback** — never default unknown statuses to a known config (e.g. `draft`). Use a neutral "Unknown" pill + dev-mode `console.warn` so the bad status surfaces during testing instead of impersonating a workflow state.
- **Submit re-entry guard must be a `useRef`, not state** — `setIsSaving(true)` doesn't synchronously block a second submit fired in the same tick. A `useRef` flag flipped on the same line as the guard short-circuits the duplicate before any async work starts. See PR #194 round-3 for the duplicate-PO bug this caught.
- **`new Date("YYYY-MM-DD")` parses as UTC midnight** — shifts to the previous day in negative-UTC time zones (US). For date-only ISO strings sourced from the DB, use `parseISO` from `date-fns` so the form shows the same calendar day the operator picked. See `app/dashboard/inventory/purchase-orders/[id]/edit/page.tsx`.

## 9. Cross-references

- `2026-04-17-migration-overview-design.md` — Rust engine roadmap (S1 → S5; orthogonal to dashboard phases).
- `2026-05-06-dashboard-phase2-design.md` — Phase 2 design spec.
- `app/dashboard/inventory/_components/` — Phase 3 file home for shared inventory primitives (DataTable, TablePagination, etc.).
- `app/components/ui/forms` — Phase 2 form primitives.
- Workspace `CLAUDE.md` — model routing for Kimi / DeepSeek / GLM dual-sign-off.
- Repo `CLAUDE.md` — architecture rules (clean architecture, server actions, hook colocation).
