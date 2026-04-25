# jobs/

Customer-ordered cut projects. One `jobs` row per project, plus
`job_parts` rows for the line items, `job_assignees` for the
shop roster, and `job_roll_allocations` for earmarked inventory.
Customer info (`customer_name`, `customer_email`,
`customer_phone`, `customer_po_number`) lives inline on the job
row — no separate customers table by design.

Cut history links back via `cut_history.job_id` /
`cut_history.job_part_id`. Purchase orders link back via
`purchase_orders.job_id`. All nullable so legacy + general-cutter
flows still work unchanged.

## No detail route

There is **no `/dashboard/jobs/[id]` page**. The detail view is a
right-docked drawer that opens on row click — same pattern the
inventory list uses. Keeps the operator on one surface; edits /
delete / parts / assignees / PDF export all happen inline.

## Files

- **page.tsx** -- Jobs list. PageShell (dense) + PageHeader with
  "New job" action; ViewToolbar search across job number, name,
  customer, PO; table with status badge + due date; each row
  opens `JobDetailDrawer`. Per-row kebab menu also has Edit +
  Delete so nothing depends on the drawer being healthy.

## \_components/

- **job-detail-drawer.tsx** -- Right-docked shadcn Sheet that
  opens on row click. Fetches job + parts + assignees +
  allocations + sufficiency + POs + cuts in parallel via
  `Promise.allSettled` (never blanks on one failed secondary
  query). Header has Edit / Delete / Export PDF. Body renders
  the six domain panels below.
- **job-form-dialog.tsx** -- Zod-validated create / edit dialog.
  Create mode triggers the drawer to auto-open on success (so the
  operator lands on the parts + sufficiency view without clicking
  back in).
- **job-parts-panel.tsx** -- Parts table + "Add part" dialog.
  Dimensions × quantity × material, inline sqft totals.
- **job-sufficiency-panel.tsx** -- Per-material needed / available
  / shortfall readout against active inventory rolls. Three states
  ordered by severity: **Infeasible width** (at least one part is
  wider than every roll of its material — "Source new stock"
  button), **Shortfall** (enough width, not enough length —
  "Create PO" deep-link with the gap pre-filled), or **Covered**.
  Availability subtracts lengths earmarked by *other* jobs via
  `job_roll_allocations` so a roll already committed elsewhere
  doesn't double-count. Reserved sqft is also surfaced inline.
- **job-roster-panel.tsx** -- Lead + worker assignees. One lead
  per job enforced via a DB partial unique index.
- **job-allocations-panel.tsx** -- Earmarked rolls (selector
  filters active rolls not already allocated to this job).
  Allocations are informational; real consumption still happens
  via cut_history.
- **job-purchase-orders-panel.tsx** -- POs with `job_id` pointing
  at this job. Status badge mirrors the PO list palette.
- **job-cuts-panel.tsx** -- cut_history rows linked to this job;
  metric summary + PDF link. The PDF action always renders: it
  opens `pdf_url` directly when present, falls back to
  `POST /api/cuts/history/[id]/pdf` to regenerate from
  `layout_json` when missing (issue #127), and is disabled with a
  tooltip on legacy rows that have neither. No layout thumbnails
  (per the customer-facing rule — layouts stay in the internal
  cut history view).
- **job-pdf.ts** -- jsPDF builder. Receipt-style: customer +
  company header, roster, parts, allocated rolls, totals.
  **No cut layouts.** Exports `buildJobPdfBlob` for
  share-link uploads and `jobPdfFileName` for consistent naming.
- **job-share-link-dialog.tsx** -- "Share link" action on the
  drawer. Builds the PDF client-side, uploads to the private
  `job-pdfs` bucket via `uploadJobPdf`, and displays a copyable
  7-day signed URL the operator can send to the customer. No
  recipient login required during the TTL window.

## Backend

- **Migrations:**
  - `20260420000004_create_jobs_tables.sql` -- jobs + job_parts +
    `J-000001`-style sequence + trigger. Adds `job_id` /
    `job_part_id` nullable columns on `cut_history`.
  - `20260420000005_job_assignees_and_roll_allocations.sql` --
    job_assignees (lead + workers, DB-enforced one lead) +
    job_roll_allocations (earmarked inventory).
  - `20260420000006_purchase_orders_job_link.sql` --
    `purchase_orders.job_id` nullable FK.
- **Service:** `@/src/infrastructure/services/jobService`
  re-exports `jobsRepository` from
  `@/src/infrastructure/repositories/jobs.repository.ts`. Handles
  jobs CRUD, parts CRUD, assignees CRUD, allocations CRUD,
  sufficiency computation, linked-PO + linked-cut listing. Also
  re-exports `uploadJobPdf` from
  `@/src/infrastructure/services/jobPdfShareService.ts` for the
  signed-URL share flow.

## Tests

- `tests/jobs/sufficiency.test.ts` exercises `aggregateSufficiency`
  (the pure function behind `computeSufficiency`). Covers width
  feasibility, allocation subtraction, reservation capping,
  material normalisation (case + whitespace), null material
  fallback, and severity-based sort order.

## Auto-status transitions

The cut-history POST route (`app/api/cuts/history/route.ts`) flips
a job to `completed` when the linked cut brings the total
`parts_completed` at or above the sum of `job_parts.quantity`.
Policy lives in `JobsRepository.shouldAutoComplete` (pure, unit-
tested) and refuses to stomp on `completed` / `cancelled` — those
terminal states require an operator to explicitly re-open.
Side-effect is best-effort: any query failure is logged but
doesn't block the cut insert.

## Coming next

- Pre-fill the PO creator when the "Create PO" button fires —
  currently it just passes query params that the creator doesn't
  yet read.
- Per-line fulfilment: stamp `cut_history.job_part_id` when the
  engine knows which job_part a cut maps to, so the auto-complete
  check can distinguish "10 cuts of part A" from "5 cuts each of
  parts A + B".
