# Dashboard Phase 2 — Settings + Admin design

**Status:** Locked 2026-05-06 after parallel Kimi K2.6 (cloud) + Codex briefs and founder sign-off on the synthesis.
**Author:** Claude synthesis of two independent design briefs (see §9).
**Predecessors:**

- ARC-202 — Phase 1 dashboard shell + brand tokens (PR #179, merged to `dev`).
- ARC-205 — Phase 1b dashboard landing page chrome (PR #180, merged to `dev`).

## 1. Goal

Carry the Phase 1/1b design language through the **form-heavy** and
**table-heavy** surfaces that have not yet been touched: Settings
(`general`, `profile`, `materials`, `notifications`) plus the Admin
surfaces (`/users`, `/security`). Today these still render the
shadcn defaults — rounded-`bg-muted` chip tabs, lavender focus
rings, `font-medium` sm labels, `bg-card` rounded-lg form cards —
which look like a different product next to the Phase 1b sidebar
and dashboard landing.

Success = the entire `/dashboard` tree reads as one product:

- Mono uppercase 0.22em eyebrow language across labels, tabs,
  section eyebrows, and table headers.
- Signal-orange focus + filled controls; no lavender shadcn
  defaults remain on Settings or Admin surfaces.
- WCAG AA for all text, focus, and intent states (orange-on-mill
  fails 4.5:1 → text stays Inkwell, intent is carried by border +
  icon + weight).
- One reusable form primitive set under `app/components/ui/forms/`
  that PR 2-4 (and any future settings-style surface) consume.

## 2. Decisions (locked)

Decisions both Codex and Kimi agreed on are listed unanimously;
the six load-bearing forks are called out separately with the
adopted pick + rationale.

### 2.1 Unanimous

- **Field labels** = JetBrains Mono `text-[11px] font-medium
uppercase tracking-[0.22em]` above the input, `8px` gap. Reason:
  extends the Phase 1b eyebrow language. Sentence-case Inter would
  read as a different product.
- **Required marker** = `*` after the label text in signal-orange
  (`text-primary` token). Never a `Required` pill.
- **Settings tab strip** = mono uppercase underlined tabs with a
  `2px` signal-orange or Inkwell active rule under the label.
  Replaces the rounded `bg-muted` chip strip.
- **Tab persistence** = `pathname.startsWith(href)` — already in
  the codebase and correct for nested settings routes.
- **Audit log row visual** = `DataTable`, **not** `ActivityFeedRow`.
  Audit logs need sortable/filterable forensic density and a
  severity column; feed rows sacrifice that for visual rhythm.
- **Roles & permissions in Phase 2** = read-only role × permission
  matrix. RBAC server-side wiring stays out of scope for this
  visual pass.
- **Users invite** = modal (existing `<Dialog>`), not a full page.
  Preserves filter state and table context.
- **Section pattern** = mono eyebrow + Manrope H2 + muted Inter
  description + bordered content block.

### 2.2 Forks (founder-resolved)

| #   | Fork                   | Picked                                                                                       | Rationale                                                                                                                                                                                                        |
| --- | ---------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Save UX                | Per-section Save/Cancel + Sonner toast (Kimi)                                                | Phase 1b doesn't yet establish a sticky-footer pattern; per-section is lighter surface for the foundation PR. The sticky footer is reserved for _cutting-engine_ parameter overrides (S5+).                      |
| 2   | Input fill             | Transparent + hairline `border-input` (Kimi)                                                 | DataTable, StatCard, and the Phase 1b cards already use the mill-paper base. A recessed mill-paper input nests as "card-on-card" inside those surfaces. Transparent reads as a typed surface.                    |
| 3   | Error text color       | Inkwell (`text-foreground`) text + signal-orange `AlertTriangle` icon + `font-medium` (Kimi) | Hard WCAG constraint: signal-orange text on mill paper fails 4.5:1 at small sizes. Orange carries error semantics through the `aria-invalid` border, the icon, and the weight; the message itself stays Inkwell. |
| 4   | Materials Add/Edit     | Right `<Sheet>` drawer at `w-[480px]` (Kimi)                                                 | Materials catalog is the most-used CRUD in Settings. Operators add many in succession; drawer keeps the catalog visible behind it. Modal is reserved for one-shot actions like Invite.                           |
| 5   | PR 1 scope             | Primitives + tab strip + section header **only** — no settings sub-pages (Codex)             | Foundation in isolation. A bug in a primitive then means changing one file, not four. Sub-pages land in PR 2-4.                                                                                                  |
| 6   | Settings reading width | `max-w-2xl` content well in `settings/layout.tsx` (Kimi)                                     | Forms read better at ~67ch. Without the constraint the settings would stretch to the full sidebar-aware width.                                                                                                   |

### 2.3 Open questions resolved inline

| Q                        | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| shadcn override strategy | **New `app/components/ui/forms/*` path, not in-place mutation** of existing `app/components/ui/{input,label,switch,…}.tsx`. Reasons: (a) we don't yet know whether legacy surfaces depend on the existing shadcn styling; (b) Phase 2 is scoped to Settings + Admin, so the new primitives don't need to replace the world; (c) once Phase 4 ships, an explicit deletion pass per the cleanup-obsolete-code rule retires whichever shadcn primitives become unused. |
| Materials archive copy   | Reversible. Copy = `Archive material` / `Restore material`. Not destructive delete.                                                                                                                                                                                                                                                                                                                                                                                 |
| Mock data for Admin PR   | Yes. PR 4 ships with mocked role + audit data so the visual pass isn't blocked on RBAC server actions; mocked data is fenced behind explicit `// TODO(arc-XXX): wire to real RBAC server action` markers so the cleanup pass can find them.                                                                                                                                                                                                                         |
| Roles fixed names?       | No. Render whatever the role source returns; the PR 4 mock returns Admin / Cutter / Manager / Member / Supervisor / Viewer (the canonical RBAC set per `app/lib/rbac.ts`).                                                                                                                                                                                                                                                                                          |
| SMS toggle               | Render disabled with `Coming soon` helper text. Avoids users toggling a switch that does nothing.                                                                                                                                                                                                                                                                                                                                                                   |

## 3. Token / class spec

All values are expressed as token-bound Tailwind utilities. Raw
hex literals are forbidden in the new primitives — every color
goes through `--primary`, `--foreground`, `--muted-foreground`,
`--border`, `--border-subtle`, `--input`, `--ring`, `--destructive`,
or `--background`. The Phase 1 token table is in
`app/globals.css` and is the authoritative source.

### 3.1 Field label / helper / error

```tsx
// Label
"font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-foreground/80 leading-4 block"

// Required marker
"ml-0.5 align-top text-primary"

// Helper text
"mt-1 text-xs leading-4 text-muted-foreground"

// Error text — Inkwell text + orange icon, NOT orange text
"mt-1 flex items-center gap-1.5 text-xs leading-4 font-medium text-foreground"
// AlertTriangle icon inside: "size-3.5 text-primary shrink-0"
```

### 3.2 Inputs (existing `<Input>` is reused — it already uses tokens)

Existing shadcn `<Input>` at `app/components/ui/input.tsx` already
uses `border-input` + `bg-transparent` + `h-9` + `rounded-md` +
`focus-visible:ring-ring/50 focus-visible:ring-[3px]`. The `--ring`
token is already signal-orange at 35% opacity. **No changes.**

The new primitives compose around the existing `<Input>`, `<Select>`,
`<Textarea>`, `<Switch>`, `<Checkbox>` — they do not duplicate or
re-style them.

### 3.3 Layout primitives

```tsx
// FormGroup — vertical stack (one section)
"space-y-5"

// FormRow — paired fields, mobile-first
"grid gap-4 sm:grid-cols-2"

// FormFieldset — section wrapper inside a form
"pt-6 first:pt-0"
// add when not first:
"border-t border-border-subtle"
```

### 3.4 Section header

```tsx
<header className="space-y-1">
  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Eyebrow</p>
  <h2 className="font-display text-lg font-semibold leading-6 tracking-tight text-foreground">
    Section title
  </h2>
  <p className="max-w-[55ch] text-sm leading-5 text-muted-foreground">Description</p>
</header>
```

### 3.5 Per-section action row

```tsx
// FormActions — Save / Cancel + last-saved
"flex items-center justify-between gap-4 pt-6"

// Saved indicator (mono caption, replaces orange success text since orange fails AA)
"font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground"
```

Buttons reuse the existing `<Button>` variants:

- **Save** = `variant="default"` (signal-orange filled, Inkwell text — the Phase 1 default).
- **Cancel** = `variant="ghost"` with mono uppercase children.

### 3.6 Settings tab strip (replaces the chip strip)

```tsx
<nav className="sticky top-0 z-10 overflow-x-auto border-b border-border-subtle bg-background/95 px-4 backdrop-blur md:px-6">
  <div className="mx-auto flex max-w-[1800px] items-center gap-6 py-2">
    {tabs.map((tab) => (
      <button
        key={tab.id}
        type="button"
        onClick={() => router.push(tab.href)}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "relative font-mono text-[11px] uppercase tracking-[0.22em] py-2 transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:rounded-sm",
          isActive
            ? "text-foreground after:absolute after:inset-x-0 after:bottom-[-1px] after:h-[2px] after:bg-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        {tab.label}
      </button>
    ))}
  </div>
</nav>
```

The active rule is **Inkwell**, not signal-orange — orange is
reserved for primary action and error intent. Inkwell rule + body
text reads as "you are here" without burning the accent token.

## 4. Per-surface spec

### `/dashboard/settings/layout.tsx`

- PageHeader stays whatever each sub-page provides (the layout
  doesn't render a PageHeader).
- Restyled tab strip per §3.6.
- Content well: `max-w-2xl mx-auto py-8` to keep form columns
  readable.

### `/dashboard/settings/general/page.tsx` (PR 2)

- Section 1 — Organization: tenant name, legal/display name.
- Section 2 — Regional defaults: timezone, locale, date format.
- Section 3 — Operational defaults: default unit, default low-stock
  threshold.
- Each section uses `<FormGroup>` + `<FormSectionHeader>` + `<FormActions>`.
- Saved-state copy: `Last saved at {HH:mm}` once a save lands;
  reverts to nothing while idle.

### `/dashboard/settings/profile/page.tsx` (PR 2)

- Section 1 — Personal: display name, phone (email read-only).
- Section 2 — Account: role (read-only), tenant (read-only),
  Change password modal trigger.
- Section 3 — Preferences: default landing page.
- Read-only fields render as `<Input disabled>`.

### `/dashboard/settings/materials/page.tsx` (PR 3)

- PageHeader with `Add material` action (signal-orange).
- Filters row above table: search + status select.
- DataTable for material catalog with row actions menu (Edit / Archive).
- Add/Edit = right `<Sheet>` drawer (`side="right"` width `w-[480px] sm:w-[520px]`) with the same `<FormGroup>` primitives.
- Archive = confirm dialog with reversible copy (`Archive material? You can restore it later from the archive view.`).

### `/dashboard/settings/notifications/page.tsx` (PR 3)

- Section 1 — Thresholds: low-stock threshold number input.
- Section 2 — Channels: Email / Push / In-app `<Switch>` rows.
  SMS row renders disabled with `Coming soon` helper.
- Section 3 — Quiet hours: start/end + timezone (timezone reuses
  the General-tab value as a read-only display).
- Switch rows pattern: `flex items-center justify-between gap-6
border-t border-border-subtle py-4`.

### `/dashboard/users/page.tsx` (PR 4)

- PageHeader with `Invite user` primary action.
- Filters row: search + role select + status select.
- Bulk action bar appears when `selectedCount > 0`:
  `border-y border-border-subtle bg-muted/40 px-4 py-3`.
- DataTable: select / Name (avatar + email) / Role badge / Status
  badge / Last active / Actions menu.
- Invite flow = `<Dialog>` with email + role + optional message
  textarea.

### `/dashboard/security/page.tsx` (PR 4)

- 4-card hero: Active sessions / MFA enforcement / Audit events
  7d / Failed logins 24h. Uses Phase 1b `<StatCard>` directly.
- Section: Access policy — MFA enforcement switch, session timeout
  select.
- Section: Roles & permissions — read-only role × permission
  matrix table (`<DataTable>` with cell-level intent badges).
- Section: Audit log — `<DataTable>` with severity column.
  Severity intent mapping:
  - `info / default` → muted dot
  - `success` → success-token dot
  - `warning` → warning-token dot
  - `failed / destructive / security-risk` → danger-token dot
  - `admin / system policy change` → accent-token dot

## 5. Sequencing

PRs are sized for review surface, not time. Each PR is independently
mergeable to `dev` and gated by its acceptance criteria.

### PR 1 — Form primitives + tab strip + section header _(this PR)_

Acceptance:

- New `app/components/ui/forms/` directory with `FormField`,
  `FormFieldGroup`, `FormFieldRow`, `FormFieldset`,
  `FormSectionHeader`, `FormActions`, plus a barrel `index.ts` and
  a directory `README.md`.
- `app/dashboard/settings/layout.tsx` tab strip restyled per §3.6.
- `app/components/ui/README.md` references `forms/`.
- `app/dashboard/settings/README.md` (or new file if absent)
  notes the new primitives and where to import them from.
- Vitest suite passes; `npm run typecheck` + `npm run lint` clean;
  Prettier formatted.
- No settings sub-pages, admin surfaces, or `<Input>` /
  `<Switch>` / `<Checkbox>` / `<Select>` modifications in this PR.
- CodeRabbit local review clean before commit.

### PR 2 — General + Profile sub-pages

Acceptance:

- `general` and `profile` rebuilt with PR 1 primitives.
- Sonner toast confirms each section save.
- Loading skeleton via existing `<LoadingCard>` / new variant if
  needed.
- Read-only fields (email, tenant) styled per §3.

### PR 3 — Materials + Notifications

Acceptance:

- Materials uses existing `<DataTable>` + a right-side `<Sheet>`
  drawer for Add/Edit per §4.
- Notifications uses `<Switch>` rows + threshold inputs.
- Archive confirm uses reversible copy.
- SMS row is disabled with helper text.

### PR 4 — Users + Security

Acceptance:

- Users page DataTable + bulk-action bar + invite modal.
- Security page 4× StatCard hero + access-policy section + role
  matrix + audit DataTable.
- Mock data behind `// TODO(arc-XXX)` markers; no real RBAC server
  action wiring in this PR.

## 6. Risk + sequencing rationale

The biggest risk in landing primitives + sub-pages + admin in one
push is that a primitive bug surfaces in N places at once and the
review surface grows beyond what one CodeRabbit pass catches.
Splitting also lets us use the primitives in PR 2 and find the
ergonomic gaps before PR 3-4.

No prerequisite work blocks the visual pass: RBAC server actions,
real audit log persistence, invite delivery, and MFA enforcement
all stay mocked / existing until a follow-up data-wiring task.

## 7. Out of scope

- RBAC server actions, audit log persistence, invite delivery, MFA
  enforcement.
- Inline cell-edit table for Materials (would require a new
  table primitive outside the Phase 1b kit).
- Cutting-engine parameter override drawer (the sticky-footer
  pattern is reserved for that, S5+).
- Cleanup deletion pass for the existing shadcn primitives the
  new `forms/*` components don't replace — scheduled after PR 4
  per the cleanup-obsolete-code rule.

## 8. References

- `app/globals.css` — Phase 1 token table (`--primary`, `--foreground`, `--ring`, etc.).
- `app/components/patterns/README.md` — Phase 1b shared pattern library.
- `docs/superpowers/specs/2026-04-19-s3-rust-backend-design.md` — spec format precedent.

## 9. Sign-off

- Codex brief: `/tmp/rf-phase2-codex.md` (322 lines, full token + per-surface spec).
- Kimi K2.6 (cloud) brief: `/tmp/rf-phase2-kimi.md` (167 lines, full token + per-surface spec, includes role-badge spec adopted into PR 4).
- Founder approval: 2026-05-06 on the synthesis (6 forks + 3 open questions resolved per §2.2 / §2.3).
