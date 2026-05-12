# `app/lib/pdf/` — Phase 7 PDF design system

Shared chrome + drawing primitives for every Rubberfit PDF. The eight per-PDF builders (`app/dashboard/jobs/_components/job-pdf.ts`, `app/dashboard/cutting-engine/_components/cut-history-pdf.ts`, etc.) compose these helpers instead of pixel-pushing their own constants — that's how the eight PDFs read as siblings.

Kimi K2.6's authoritative design direction lives at `.claude/research/phase7/kimi-design-direction.md`. The constants in `tokens.ts` ARE that direction in code. Don't change a value here without changing the doc first.

## Files

| File            | Purpose                                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| `tokens.ts`     | Locked design tokens — RGB triples, type roles, page geometry, chrome offsets.                                  |
| `chrome.ts`     | `drawCustomerChrome`, `drawInternalChrome`, `stampFooter`, `stampFooterOnEveryPage`. Full-page header + footer. |
| `primitives.ts` | `drawKpiCard`, `drawRuledTable`, `drawStatusChip`, `drawSectionDivider`, `drawSignatureBlock`, label accents.   |
| `pagination.ts` | `ensureSpace` (page-break helper), `contentBottomY`.                                                            |
| `index.ts`      | Barrel — consumers import from `@/app/lib/pdf`.                                                                 |

## Purity rule

**Nothing in this module may reference `document`, `window`, `Image`, `canvas`, browser `bwip-js`, `toast`, or any other browser-only global.**

The server-side cut PDF route (`app/api/cuts/history/[id]/pdf/route.ts`) imports from here in a Node runtime. Anything that needs a browser API (barcode generation, file download trigger) stays in the per-PDF builder, not here.

A static `tests/pdf/chrome-purity.test.ts` guard enforces the rule.

## Canvas system

Kimi splits all full-page PDFs across two canvases:

| Canvas     | Page                 | Margin | Used by                                     |
| ---------- | -------------------- | ------ | ------------------------------------------- |
| `customer` | Letter 612×792pt     | 48pt   | Job Sheet, Purchase Order, Analytics Report |
| `internal` | A4 595×842pt (in pt) | 42pt   | Cut History, Dashboard, Server Cut          |

Labels skip full chrome — they use the lighter `drawLabelTopRule` / `drawBarcodeHeaderBar` helpers instead.

## Type system

Helvetica + Courier only — no custom font embedding. Six named roles in `TYPE`: `display | h1 | h2 | body | caption | mono`. Hierarchy comes from size, case, and spacing — never from weight beyond normal/bold.

## Cut-history exception

Phase 7 PR 3 applies the chrome here to `cut-history-pdf.ts`, but the **diagram body keeps its mm coordinate system internally** (founder Q3 decision, 2026-05-12). The 1204-line diagram renderer wasn't worth converting to pt; chrome and diagram meet at the boundary.

## Usage sketch

```ts
import {
  CUSTOMER_PAGE,
  drawCustomerChrome,
  drawKpiCard,
  drawRuledTable,
  stampFooterOnEveryPage,
  contentStartY,
} from "@/app/lib/pdf"

const doc = new jsPDF({ unit: "pt", format: [CUSTOMER_PAGE.width, CUSTOMER_PAGE.height] })

drawCustomerChrome(doc, {
  title: "JOB SHEET",
  subtitle: "J-000124",
  logoDataUrl: ARC_ANCHOR_LOGO_DATA_URL,
})

let y = contentStartY("customer")
// ... lay out KPI cards, tables, etc. at `y` and bump it ...

stampFooterOnEveryPage(doc, "customer", () => `J-000124 • ${timestamp}`)
```

## Phase 7 PR sequence

| PR  | Scope                                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | This module + apply to `roll-label-pdf.ts` + `r/[partNumber]/pdf/route.ts` (label surfaces — proves the module is Node-safe). |
| 2   | Adopt shared chrome in `job-pdf.ts` + `dashboard-pdf.ts`.                                                                     |
| 3   | Apply internal chrome to `cut-history-pdf.ts` + the server route.                                                             |
| 4   | Rewrite Purchase Order PDF from HTML stamper to imperative jsPDF using these primitives.                                      |
| 5   | Rewrite Analytics Report PDF from HTML stamper to imperative jsPDF using these primitives.                                    |
