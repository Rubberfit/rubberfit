# Gasket Cutting — Design Spec

**Date:** 2026-05-15
**Linear issues:** [ARC-41](https://linear.app/arc-and-anchor/issue/ARC-41), [ARC-93](https://linear.app/arc-and-anchor/issue/ARC-93), [ARC-259](https://linear.app/arc-and-anchor/issue/ARC-259)
**Status:** Draft v2 — Codex review returned REJECT on v1 with a HIGH-severity geometry-contract gap. v2 adds **PR 0** (polygon-with-holes contract end-to-end) as the prerequisite, drops the "Rust engine unchanged" claim, and re-orders dependencies. Codex sign-off pending re-review. Kimi K2.6 UI design returned and is referenced in §4.2.

---

## 1. Goals

Ship a gasket-cutting workspace under the Cutting engine surface that:

1. Lets operators design gasket parts parametrically (ring, full-face with bolt circle, obround) and place them on stock for manual or auto-nested cutting.
2. Accepts CAD geometry (DXF curves + holes; SVG) as additional part inputs, completing the CAD-import work started in ARC-41 PR #215 and bringing SVG support (the web counterpart of ARC-93) into the same flow.
3. Exports the packed layout to DXF in a format consumable by CNC cutting machines, hitting ARC-259's hard requirement — exposed as an option on **every** saved cut (Auto nest, Free roam, gasket cutting), not gated to gasket workflows.

**Geometry-contract caveat (Codex REJECT finding).** jagua-rs supports polygons with holes natively, but the *app-side wire contract* does not — `Part.polygon` is `Point2D[]` (single contour) at every layer: `src/application/packing/types.ts:40-51`, `engine/crates/rf-layout/src/domain/request.rs:48-63`, the jagua adapter using `ExtShape::SimplePolygon` only (`infrastructure/jagua_adapter.rs:217-222`), `PlacedPart.polygon` in `layout-model.ts:60-62`, and the Konva renderer drawing one `<Line closed>` per polygon (`konva-part-shape.tsx:203-214`). Holes are dropped silently today even on PR #215's polygon lane.

The packing algorithm carries over. The wire contract does not. **PR 0 below** lifts `Polygon = Point2D[]` to `PolygonWithHoles = { outer: Point2D[]; holes: Point2D[][] }` end-to-end before any gasket or import work depends on it.

## 2. Non-goals

- **DWG ingest.** Operators "Save As DXF (R2018 ASCII)" — same constraint ARC-41 PR1 set. DWG is a paid AutoDesk binary format; not worth licensing or shelling out to `libredwg` in v1.
- **Welding lines, leader lines, dimensions in DXF export.** Output is part geometry only. Tab/bridge/lead-in markup is a future request.
- **Multi-currency or multi-unit display preferences.** Inherits org/user prefs from the existing pipeline.
- **The desktop half of ARC-93.** Desktop (Tauri) keeps its preferred Rust-side parsing path; this spec only covers the web app. Sharing the Rust crate is a future consolidation, not in scope.
- **Replacing Steven's PR #215.** This spec continues from where PR1 lands — PR2 and PR3 of ARC-41 are part of the work plan here.
- **Tool-path optimization, kerf-direction logic for CNC.** Out of scope; the CNC operator's CAM software owns that.

## 3. Linking the three issues

| Linear | Scope this spec covers |
|--------|------------------------|
| ARC-41 (DXF import, web, in progress as PR #215 PR1) | Continue with PR2 (curves + multi-loop + bulges) and PR3 (multi-part + multi-layer). PR1 is being driven by Steven and is open against `dev`; this spec assumes it merges as-is. |
| ARC-93 (SVG + DXF, desktop) | Brings the **SVG import** half of ARC-93 to the web app's cut-list upload. The desktop track stays separate (different repo, Tauri Rust path). Web SVG implementation can later inform the desktop port. |
| ARC-259 (gasket cutting + DXF export) | Full implementation: gasket sub-tab, parametric gasket primitives (makerjs), DXF export. |

Net deliverable: one new operator-facing surface (Gasket cutting tab) plus three extensions to the existing import/export pipeline.

## 4. UI structure

### 4.1 Route + sidebar

New peer route under the Cutting engine surface:

```text
app/dashboard/cutting-engine/
├── page.tsx                  (Auto nest, existing)
├── free-roam/page.tsx        (Free roam, existing)
└── gasket-cutting/page.tsx   (Gasket cutting, NEW)
```

Sidebar addition in `app/navigation/sidebar/sidebar-items.ts`:

```ts
subItems: [
  { titleKey: "items.cuttingEngine.subItems.autoNest",       url: "/dashboard/cutting-engine" },
  { titleKey: "items.cuttingEngine.subItems.freeRoam",       url: "/dashboard/cutting-engine/free-roam" },
  { titleKey: "items.cuttingEngine.subItems.gasketCutting",  url: "/dashboard/cutting-engine/gasket-cutting" }, // NEW
],
```

i18n keys added to `en-US` + `es-MX` namespaces.

### 4.2 Page layout

Same three-column workspace pattern as Free roam (left: parts queue, center: Konva canvas, right: rail) so the visual language stays continuous with the existing Cutting engine surfaces (per founder feedback `feedback_kimi_ui_continuity_across_sites.md`).

**Kimi K2.6 visual design — APPROVED for v1 reference.** Full design at `.claude/handoff/gasket-cutting-kimi-ui-result.md`. Highlights:

- **Left rail** — Gasket queue with mini-SVG thumbnail cards (`w-12 h-12` rounded preview rendered in signal-orange stroke, no fill, viewBox preserving proportions). Card text: shape type + primary dims (e.g. `Ring · OD 12″ ID 8″`). Quantity pill top-right, tag letter bottom-left. Primary `+ Add gasket` button (signal-orange fill), secondary `Import CAD` outline button below.
- **Center canvas** — Reuses Free roam's `KonvaSheetRenderer` verbatim. Floating zoom/pan/fit toolbar pill, same DnD snap highlights.
- **Right rail** — Stock editor + per-cut metrics (yield %, linear feet, part count) + `Save cut`. No dedicated Export DXF button — DXF lives in the cut-history file-icon dropdown (§7.3) so it works cross-mode.

**Add gasket workspace — uses the side `Sheet` pattern** (`SheetContent side="right"`, `w-full sm:max-w-2xl lg:max-w-4xl`), matching the inventory roll / job / purchase-order detail drawers elsewhere in the dashboard (founder ruling 2026-05-15 — overrides Kimi's v1 centered `Dialog` proposal). Slide-in from the right; the canvas stays visible behind the overlay so the operator can see context. Internal layout same as Kimi's v1 design — segmented `Tabs` control at top (Ring / Full-face / Obround / Import CAD), `grid grid-cols-1 md:grid-cols-2 gap-6` body with form left and live SVG preview right (signal-orange stroke 1.5px, dimension labels in monospace to 3 decimals, bolt holes as filled circles on BCD), footer with Quantity stepper + Part number + Cancel/Add actions. Import CAD tab **launches the existing `DxfReviewDialog` as a separate modal** (founder ruling — no embed/refactor of the review dialog).

**Cut-history dropdown:** `DropdownMenu` triggered by `Button variant="ghost" size="icon"` with `FileDown` icon. Items: Download PDF (`FileText`), Download DXF (`FileCode`). DXF item gets `disabled` + hover tooltip "DXF unavailable for legacy cuts" for rows that pre-date `layout_json` persistence (founder ruling — generic copy, no dates).

**Mobile (below `md:`):** Three columns collapse to single stacked flow (canvas → stock + metrics). The gasket parts queue collapses into a **bottom-sheet drawer** (founder ruling — matches existing mobile patterns in the dashboard, doesn't fight for canvas vertical space). Add gasket `Sheet` becomes near-full-screen (`w-full` on mobile) with form-then-preview vertical stack.

**Kimi's five open questions — RESOLVED by founder 2026-05-15:**
1. **Import CAD tab** — separate modal. Specifically the existing `DxfReviewDialog` launches as a separate modal on tab-pick, not embedded inside the gasket sheet.
2. **Bolt count bounds** — 2–32 (matches industry standard for ASME flange patterns; comfortable headroom).
3. **Unit toggle** — respects global org/user preferences (the same wiring the export path uses, §7.3).
4. **Mobile queue affordance** — bottom-sheet drawer, matching existing dashboard patterns.
5. **DXF disabled-tooltip copy** — generic "DXF unavailable for legacy cuts" on hover. Legacy cuts don't get the feature.

## 5. Gasket primitives

Four shape types in the registry. All four produce a `partType: "polygon"` with optional holes, feeding the existing pipeline unchanged.

### 5.1 Ring gasket

**Inputs:** outer diameter (OD), inner diameter (ID).
**Geometry:** annulus — one outer closed loop (OD circle), one inner closed loop (ID hole).
**Tessellation:** outer + inner circles → polylines via Maker.js's chord-length / max-facet controls, not a fixed angle step. **Default chord deviation = 0.005″** (≈ 32–64 vertices for typical gasket sizes), benchmarked in PR C against pack-time regression. Codex flagged the original "1°/0.25°" plan as vertex-heavy (would emit 360–1440 vertices per circle and 720–2880 for a full-face gasket — bad for jagua-rs solve time). Configurable per-org if needed; not exposed to operators by default.

### 5.2 Full-face gasket

**Inputs:** OD, bore ID, bolt-circle diameter (BCD), bolt count (n), bolt-hole diameter.
**Geometry:** one outer loop (OD circle) plus 1 + n inner loops (bore + n bolt holes evenly spaced on BCD, starting offset configurable).
**Convention:** ASME B16.21 bolt patterns supported as presets ("ANSI 150 #4", etc.) — implemented in PR D, not v1. v1 is fully parametric.

### 5.3 Obround / oval gasket

**Inputs:** overall length (L), overall width (W).
**Geometry:** rectangle with semicircular caps on the short sides. Tessellated to a single closed polyline (no holes).

### 5.4 Imported gasket (DXF or SVG)

**Inputs:** uploaded file, unit selection (mm/inch, auto-detected when possible), part-of-interest selection (multi-part files).
**Geometry:** outer boundary + holes as parsed by the CAD layer.

## 6. Open source libraries

**Codex correction:** PR #215 already pulls in **`dxf-parser`** (gdsestimating, MIT) — *not* the `dxf` package (skymakerolof, MIT, a separate project). Continue with `dxf-parser` for ARC-41 PR2 unless a focused spike in that PR proves `dxf.toPolylines()` materially shrinks the curve-handling code. Spec v1 mis-identified the package.

| Library | License | Role | Justification |
|---------|---------|------|---------------|
| **makerjs** | Apache 2.0 (Microsoft) | Parametric primitive generation (ring, bolt-circle, obround), chord-length tessellation | Purpose-built for 2D mechanical drawings. Has `makerjs.models.Ring`, `BoltCircle`, `Oval`, `RoundRectangle`, plus `model.findChains` + `chain.toKeyPoints` with chord-length tolerance. ~50 kB gzipped. **Used for model construction only — does NOT solve the geometry contract; PR 0 handles that.** |
| **dxf-parser** (gdsestimating) | MIT | DXF parsing extension for ARC-41 PR2 (arcs, circles, splines, ellipses) | Already in `package.json` via PR #215. Continue with it + explicit tessellation via shared `tessellate-curves.ts` helper. |
| **svgson** | MIT | SVG → AST | XML parse to operate on `<path>`, `<rect>`, `<circle>`, `<polygon>` with their transforms. |
| **svgpath** | MIT | SVG path tokenization + transform composition + arc → bezier | Handles `d=""` parsing and applies transform matrices. **Does NOT flatten beziers to polylines on its own.** Pair with explicit bezier flattener (chord-deviation-bounded recursive subdivide, ~50 LoC); the shared `tessellate-curves.ts` helper from PR A is the natural home. |
| **hand-rolled DXF writer** | n/a | DXF export for ARC-259 / cut-history dropdown (PR D) | LWPOLYLINE + CIRCLE + header + units + layers is small and testable. `@tarikjabiri/dxf` adds bytes for entities we don't emit. Codex confirms hand-rolled is the right call for v1; revisit if export scope expands. |
| **clipper-lib** | Boost | Polygon prep — repair self-intersections, dedup vertices, hole orientation (CW outer / CCW holes) | Already in tree (used by `free-roam-regions.ts`). Drives the ingest sanitization step for both DXF and SVG imports. |

**Explicitly rejected:**
- `opencascade.js` — heavyweight LGPL CAD kernel, too much rope.
- `dxf` (skymakerolof package) — duplicates work already done by `dxf-parser` in PR #215. Spec v1 incorrectly named this; corrected.
- `@tarikjabiri/dxf` — hand-rolled emit is leaner for v1's two-entity output.

**Reference reading (not dependencies):** SVGnest / Deepnest.io polygon prep code for self-intersection repair patterns to apply via clipper-lib.

## 7. Architecture

### 7.0 PR 0 prerequisite — `PolygonWithHoles` contract end-to-end

Before any gasket, import, or export work, the geometry contract lifts from single-loop polygon to polygon-with-holes across every layer. **All other PRs depend on this.** Touch points:

| Layer | Current | New |
|-------|---------|-----|
| TS request (`src/application/packing/types.ts:40-51`) | `polygon?: Point2D[]` | `polygon?: { outer: Point2D[]; holes: Point2D[][] }` |
| Rust request (`engine/crates/rf-layout/src/domain/request.rs:48-63`) | `polygon: Option<Vec<Point2D>>` | `polygon: Option<PolygonWithHoles>` |
| jagua adapter (`infrastructure/jagua_adapter.rs:217-222`) | `ExtShape::SimplePolygon { points }` only | Branch on hole presence → `ExtShape::SimplePolygon` for no-hole, `ExtShape::Polygon` for holed |
| Layout result wire — Rust (`engine/crates/rf-layout/src/domain/result.rs`) | `Placement.polygon: Vec<Point2D>` / `pack_polygon` | `PolygonWithHoles` |
| Rust internal helpers — `Part::polygon_slice()` callers, area + free-space math | single-contour assumption | hole-aware (outer area − sum(hole areas)) |
| TS `buildPart` input + zod schema | `polygon?: Point2D[]` | `polygon?: PolygonWithHoles` with `holes` array |
| `template-to-part.ts` + `PartTemplate` type | flat polygon | structured polygon-with-holes |
| `pack-result-to-layout-model.ts` adapter | single-contour copy | preserves `holes` end-to-end on the way back to UI |
| `LayoutModel.PlacedPart.polygon` (`layout-model.ts:60-62`) | `Point2D[]` | `PolygonWithHoles` |
| Konva renderer (`konva-part-shape.tsx:203-214`) | one `<Line closed>` | outer `<Line closed>` + N hole `<Line closed>` rendered as cutouts (fill-rule even-odd or `<Path>`) |
| PDF renderer (cut-history PDF) | single path | outer + holes via SVG even-odd fill rule |
| Free-roam collision (`free-roam-collision.ts:35-37,97-128,164-171`) | SAT on single polygon + ring-only circular-hole exception | Generalize to arbitrary holes — collide against outer; **holes are voids, placements fully inside a hole ARE allowed** (matches jagua-rs convention; Codex v2 recommendation). Tests cover bore-of-full-face + bolt-hole placement cases. |
| Clipper sanitation | n/a | New `sanitize-polygon-with-holes.ts` — repair self-intersections, dedup, enforce orientation (CW outer / CCW holes) |
| `cut_history.layout_json` schema | single-contour parts | polygon-with-holes parts — versioned (`version: 2`) with backward read of `version: 1` rows. **Both reader paths must support v1+v2:** strict `isLayoutModelArray()` in `app/api/_lib/cut-pdf-server.ts` (server PDF regen) AND `coerceLayoutModelArray()` in the history load path (UI). Don't fix one and leave the other strict. |

**Tests in PR 0:**
- TS unit: round-trip a polygon-with-holes through `templateToPart` and back.
- Rust integration: a ring (annulus) packs into a sheet with the inner hole respected; a full-face with 8 bolt holes packs without bolt-hole areas being "occupied."
- Renderer snapshot: Konva renders a ring with the inner cutout visible; the PDF emits the same.
- Backward compat: load a `version: 1` `layout_json` row, render successfully, no holes (treated as empty `holes: []`).
- Fuzz: 100 random polygon-with-holes inputs → `verify-algo` agent confirms area / containment invariants.

This PR is invisible to operators — no UI change — but lights up holes everywhere they're already implied (ring gaskets, full-face, multi-loop DXF).

### 7.1 New domain modules

```
src/application/
├── cad/                          (extend existing)
│   ├── parse-dxf.ts              ← extend for arcs/splines/ellipses (PR A)
│   ├── parse-svg.ts              ← NEW (PR B)
│   ├── connect-loops.ts          ← extend for multi-loop + hole detection (PR A)
│   ├── tessellate-curves.ts      ← NEW shared helper (bezier + arc → polyline)
│   ├── sanitize-polygon.ts       ← NEW (vertex dedup, self-intersect repair via clipper)
│   └── write-dxf.ts              ← NEW (PR D — LWPOLYLINE + CIRCLE emit)
└── gasket/                       (NEW directory, PR C)
    ├── ring-gasket.ts            ← makerjs Ring → polygon+hole
    ├── full-face-gasket.ts       ← makerjs BoltCircle composition → polygon + N+1 holes
    ├── obround-gasket.ts         ← makerjs Oval → polygon
    └── gasket-template.ts        ← discriminated union + PartTemplate adapter
```

The existing `templateToPart` path picks up these primitives unchanged because they all flow through `partType: "polygon"` (the lane Steven's PR #215 added).

### 7.2 Page wiring

```
app/dashboard/cutting-engine/gasket-cutting/
├── page.tsx                                ← lazy-loads GasketCuttingContent
├── loading.tsx                             ← matches free-roam loading.tsx
└── _components/                            (peer to existing _components)
    ├── gasket-cutting-content.tsx          ← three-column shell; Kimi authors the JSX
    ├── add-gasket-dialog.tsx               ← parametric editor; Kimi authors the JSX
    ├── gasket-shape-card.tsx               ← parts-queue card with gasket preview; Kimi authors
    ├── export-dxf-button.tsx               ← right-rail control
    └── use-export-dxf.ts                   ← hook: layouts → dxf string → download
```

Per `feedback_kimi_provides_ui_after_approval.md`, **Kimi K2.6 writes the TSX** for every `*.tsx` file in `_components/` once design is approved. Claude implements the hooks + integration. Codex reviews the architecture before any code lands.

**Free-roam infra extraction (Codex MED finding).** Today the Konva renderer + placements hook + region computation live under `cutting-engine/_components/free-roam-*.ts`. Gasket cutting reusing them as `import from "../_components/free-roam-collision"` is feature-coupling. Before PR C, **extract neutral primitives** into `cutting-engine/_components/manual-layout/` (rename `useFreeRoamPlacements` → `useManualPlacements`, etc.). `KonvaSheetRenderer` is already neutral and stays in place. This extraction is part of PR C's prep — small refactor, no behavior change.

### 7.3 DXF export (cut-history-wide)

**Scope clarification:** DXF export is a property of any saved cut, not a gasket-only feature. The emitter is shared across Auto nest, Free roam, and gasket cutting — wherever there's a `LayoutModel[]` to convert.

**Invocation point:** the existing file-icon control on each row in `/dashboard/history` (and the cut-history rail elsewhere). Today it triggers PDF download from `cut_history.pdf_url`. We replace it with a small dropdown menu:

```
📄 Download ▾
  ├─ PDF      (uses pdf_url, existing behavior)
  └─ DXF      (generates on-demand from layout_json)
```

The DXF option greys out (with a tooltip) for cuts that pre-date `layout_json` being persisted on the row — there's no source of truth to emit from for those legacy rows.

**Generation strategy:** **on-demand, client-side.** `cut_history.layout_json` already contains the frozen `LayoutModel[]` from the pack run (added in PR #197 era for round-trip parity). On click, the browser:
1. Reads `layout_json.layouts` from the row.
2. Runs each layout through `write-dxf.ts` (pure function — `LayoutModel → string`).
3. Single sheet → one `.dxf` file via `Blob` + `URL.createObjectURL`; multi-sheet → bundles into a `.zip` via `jszip` and downloads.

**No schema changes.** No `dxf_url` column, no server-side emit, no migration. `cut_history` stays write-once.

**Format:** AutoCAD R2018 ASCII (`AC1032` group code in `$ACADVER`).
**Entities emitted:**
- `LWPOLYLINE` per closed loop (preferred over splines — CAM software prefers it).
- `CIRCLE` for circular holes (preserves true circle for the CNC, avoids over-tessellation).
- One DXF per packed sheet, bundled as ZIP for multi-sheet cuts.
**Precision:** 4 decimal places on coordinates (matches the existing `DECIMAL(10,4)` length/width/thickness/kerf convention — `feedback_dimension_precision_consistency.md`).
**Units:** `$INSUNITS` set to 1 (inches) by default; the emitter accepts a unit hint and converts on the way out so an mm-preferring CNC operator gets mm output (orgs can configure the default in workspace prefs — Phase 4 unit-system display already lays the groundwork).
**Layer:** all geometry on layer `0` for v1. Per-part layer namespacing (one layer per part type) is a future enhancement.

**Filename convention:** `<job-number-or-stock-label>_<cut-id-short>.dxf` (or `.zip` for multi-sheet). Falls back to `cut-<id-short>.dxf` when no job/stock label is present.

### 7.4 What does NOT change

- The packing **algorithm** (FFD + 2D grid warm-start + sparrow GLS + cross-bin swap inside jagua-rs).
- `IPackingService` interface boundary, `RustPackingService` invocation pattern (still `pack-cli` over JSON stdin/stdout — only the JSON shape changes per PR 0).
- `NestingVisualizer`'s consumer contract (it still takes `LayoutModel[]` — the model's polygon field shape changes, not the visualizer's role).
- `cut_history` table schema. `layout_json` content evolves to `version: 2` polygon-with-holes; backward read of `version: 1` rows is preserved.
- Existing CutListUpload behavior for xlsx/csv (untouched) and DXF single-loop (PR #215 stays valid post-PR-0 because single-loop DXF maps to `outer: [...]; holes: []`).

**What does change** (the §7.4 v1 mistake — Codex caught this): the Rust DTO, jagua adapter, `LayoutModel.PlacedPart.polygon` shape, Konva polygon renderer, and PDF polygon renderer all evolve through PR 0.

## 8. Phased rollout

**Seven PRs** against `dev`. PR 0 (geometry contract) is split into **0a/0b/0c** per Codex v2 recommendation — each independently reviewable, smaller blast radius, easier to bisect on regression. PRs A–D branch from 0c's merge in dependency order. **All assume PR #215 (Steven's ARC-41 PR1) merges first** so the `partType: "polygon"` lane exists in name even though PR 0 evolves its shape.

### PR 0a — Engine + DTO contract
- TS wire types: `Part.polygon` → `PolygonWithHoles` in `src/application/packing/types.ts` + zod schema + `buildPart` input shape.
- Rust request: `polygon: Option<PolygonWithHoles>` in `engine/crates/rf-layout/src/domain/request.rs`.
- jagua adapter: branch on hole presence — `ExtShape::SimplePolygon` for no-hole, `ExtShape::Polygon` for holed (`infrastructure/jagua_adapter.rs:217-222`).
- Rust result DTO: `Placement.polygon` / `pack_polygon` updated in `engine/crates/rf-layout/src/domain/result.rs`.
- Rust internal helpers: `Part::polygon_slice()` callers, area math (outer − sum(hole areas)), free-space math hole-aware.
- **Backward-compat shim:** accept old single-loop `Point2D[]` arrays at deserialization and lift to `{ outer: arr, holes: [] }`. Lets PR 0a ship without breaking existing requests in-flight.
- Tests: Rust integration — ring (annulus) packs with bore respected; full-face with 8 bolt holes packs without bolt-hole areas occupied; round-trip TS-zod ↔ Rust-serde.
- `verify-algo` agent runs a fuzz pass on the Rust integration suite.
- **Closes:** nothing on Linear; internal enabler.

### PR 0b — App-side rendering + collision
- TS `pack-result-to-layout-model.ts` preserves holes end-to-end (no flattening on output).
- `LayoutModel.PlacedPart.polygon`: `Point2D[]` → `PolygonWithHoles` (`layout-model.ts:60-62`).
- `template-to-part.ts` + `PartTemplate` type carry holes.
- Konva polygon renderer (`konva-part-shape.tsx:203-214`): outer `<Line closed>` + N hole cutouts via `<Path>` with even-odd fill rule.
- PDF polygon renderer: matching even-odd path emit so PDF preview matches Konva.
- Free-roam collision (`free-roam-collision.ts`) generalized: SAT against outer; holes are voids; placements fully inside a hole allowed (jagua convention). Tests cover bore + bolt-hole cases.
- Clipper sanitation: new `sanitize-polygon-with-holes.ts` — self-intersect repair, vertex dedup, CW outer / CCW hole orientation enforcement.
- Tests: Konva snapshot for a ring (visible cutout), PDF snapshot, collision unit tests for the hole-void semantics.
- **Closes:** nothing on Linear; internal enabler.

### PR 0c — Schema migration + backward compat readers
- `cut_history.layout_json` schema → `version: 2` polygon-with-holes parts.
- **Both readers** update to handle v1 + v2:
  - Strict `isLayoutModelArray()` in `app/api/_lib/cut-pdf-server.ts` (server PDF regen).
  - `coerceLayoutModelArray()` in the history UI load path.
  - v1 rows lift to `{ outer: arr, holes: [] }` on read; no data migration needed.
- Server PDF regen confirmed to render v2 rows correctly.
- Tests: round-trip a v1 row (load, render PDF, render Konva, save again as v2); round-trip a v2 row; fuzz 100 random `layout_json` shapes via `verify-algo`.
- **Closes:** nothing on Linear; internal enabler. Final gate before PR A.

### PR A — ARC-41 PR2: curves, holes, multi-loop
- Extend `parse-dxf.ts` to handle `ARC`, `CIRCLE`, `SPLINE`, `ELLIPSE`, polyline bulges.
- Extend `connect-loops.ts` to detect inner loops and assign them as holes on the outer polygon.
- New `tessellate-curves.ts` shared helper (used by both DXF curves and SVG bezier flattening); chord-deviation-bounded recursive subdivide.
- Use `dxf-parser` already in `package.json` from PR #215 (Codex v1 correction — spec v1 incorrectly named `dxf`). If PR #215 has not yet landed, add `dxf-parser` here.
- Tests: fixtures for each entity type, multi-loop bracket fixture, gasket fixture (ring), unit-detected fixture.
- **Closes:** most of ARC-41.

### PR B — SVG import
- New `parse-svg.ts` using svgson + svgpath.
- Resolve transforms, units, styles. Tessellate beziers/arcs via the shared helper. Detect holes.
- Wire SVG into `cut-list-upload.tsx` next to DXF; reuse `DxfReviewDialog` pattern → `SvgReviewDialog`.
- Tests: hand-authored SVG fixtures (rect with hole, gasket profile, multi-path file, transform-heavy file).
- **Closes:** web half of ARC-93.

### PR C — Gasket sub-tab + parametric primitives
- New route `cutting-engine/gasket-cutting/page.tsx` + sidebar sub-item + i18n keys.
- New `src/application/gasket/` directory with the four primitives.
- Add `makerjs` dependency.
- Kimi K2.6 authors `gasket-cutting-content.tsx`, `add-gasket-dialog.tsx`, `gasket-shape-card.tsx`.
- Reuse `KonvaSheetRenderer`, `useFreeRoamPlacements`, `useFreeRoamRegions` from the existing Free roam infrastructure (no fork — extract shared bits if needed; flag for Codex).
- Tests: each primitive's polygon output validated against known geometry (ring area = π(R²−r²), bolt count = N, etc.).
- **Closes:** ARC-259 first acceptance criterion ("gasket cutting workflows distinct from rubber sheet cutting").

### PR D — DXF export (cut-history-wide)
- New `write-dxf.ts` emitter (LWPOLYLINE + CIRCLE, R2018 ASCII, 4dp). Pure function: `LayoutModel[] → { sheets: { name, dxf }[] }`. Polygon-with-holes parts emit outer + each hole as separate LWPOLYLINEs.
- New `use-download-cut.ts` hook. **Codex MED correction:** instead of reading `layout_json` from the already-fetched list response (which can be huge for 50-sheet auto-nest jobs and is dropped by the v2 list adapter — `src/infrastructure/api-client/cut-history.ts:101-106`), the hook performs a lazy authorized fetch by cut id (`GET /api/cuts/history/[id]`) on dropdown-click. List response stays lightweight; dropdown pays per-export.
- Replace the cut-history file-icon click handler with the `DropdownMenu` from Kimi's design (`FileText` PDF / `FileCode` DXF). Same dropdown appears wherever cut rows render the file icon (history page, free-roam saved-layouts rail, etc.).
- Grey out DXF for cuts without `layout_json` (pre-#197 rows and v1 single-contour rows where this is acceptable) with the tooltip from Kimi's design.
- Verify `jszip` presence in `package.json`; add if missing.
- Tests: round-trip — emit a layout → parse it back via `dxf-parser` → assert geometric equality within tolerance. Cross-mode fixture coverage: one Auto nest fixture, one Free roam fixture, one ring-gasket fixture, one full-face fixture with 8 bolt holes.
- Validation: open one emitted file in a real CAM tool (LightBurn / Fusion 360 CAM trial) before merge — founder owns this sign-off.
- **Closes:** ARC-259 second acceptance criterion + "Done when" gate. Also delivers cross-mode CNC export value beyond gasket cuts.

Each PR follows the per-task workflow: Codex + Kimi (where UI is touched) sign-off on the task spec → implementation → CodeRabbit at phase-end before opening the PR.

## 9. Test strategy

- **Unit tests (Vitest):** every parser fixture, every gasket primitive's polygon output, the DXF writer's emit format (snapshot tests against hand-authored expected output).
- **Integration tests:** end-to-end `parse → polygon → pack → emit → reparse` round-trip in PR D.
- **Engine reuse confirmation:** PR A adds a Rust-side fixture test (`cargo test`) that packs a gasket (ring with bolt holes) to confirm jagua-rs handles the hole topology — flagged in PR1 as the assumption that needs verification. (Spawn `verify-algo` agent to formally assert no regression on packing correctness.)
- **CAM consumer validation (PR D):** manual smoke test in a real CAM tool. Founder owns the final sign-off here per `feedback_deep_verification_permission.md`.

## 10. Risks + open questions

| Risk | Mitigation |
|------|-----------|
| ~~PR 0 contract churn ripples through five+ subsystems~~ **MITIGATED** | Split into 0a/0b/0c per Codex v2 recommendation. Each PR independently reviewable, smaller blast radius. 0a's backward-compat shim accepts old single-loop arrays so 0a can land safely before 0b ships. |
| jagua-rs `ExtShape::Polygon` (holes) correctness on dense bolt-circle gaskets (8+ holes inside one part) | PR 0 includes a Rust integration test for full-face with 8 bolt holes; `verify-algo` agent fuzz-tests area / containment invariants. If jagua-rs has limits, surface them in PR 0 and re-scope. |
| makerjs tessellation resolution vs. nester performance — too many vertices per gasket hurts pack time | Default chord-deviation = 0.005″ (~32–64 verts per circle); benchmark in PR C with the pack-time parity suite. Codex specifically flagged the v1 spec's 1° default as vertex-heavy. |
| Self-intersection / degenerate edge repair on real-world DXF files | clipper-lib polygon-prep step + reject with operator-facing toast if unfixable (mirrors ARC-93 AC). |
| DXF export not actually consumed by the CNC reader the founder targets | PR D validation step opens emitted file in a real CAM tool before merge. |
| **v2 cut-history adapter drops `layout_json` on list responses** (`cut-history.ts:101-106` — Codex MED finding) | PR D fetches `layout_json` on-demand via `GET /api/cuts/history/[id]` rather than relying on the list payload. Confirmed lightweight even for 50-sheet jobs. |
| Schema/UX divergence between gasket-cutting and free-roam | PR C's prep extracts shared placements/regions/collision into `manual-layout/`. Gasket code imports from neutral primitives, not feature-named ones. |
| Steven's PR #215 changes shape before merging | All PRs in this rollout rebase on whatever lands. Spec's only contract: `partType: "polygon"` exists. PR 0 replaces its single-loop content with polygon-with-holes — that overlap is intentional and incidentally adds value to PR #215's already-shipped DXF imports. |
| svgpath does NOT flatten beziers — spec v1 implied it does (Codex MED correction) | Explicit bezier-flattener (chord-deviation-bounded recursive subdivide) lives in the shared `tessellate-curves.ts` from PR A; PR B uses it. |

**Kimi's five open questions — all RESOLVED by founder 2026-05-15:**
1. Import CAD = separate modal launch (the existing `DxfReviewDialog`), with the gasket workspace itself rendered as a side-`Sheet` matching the inventory/job/PO drawer pattern.
2. Bolt count = 2–32 (industry standard).
3. Unit toggle = respects global org/user preferences.
4. Mobile queue = bottom-sheet drawer.
5. Legacy cuts = no DXF feature; generic hover tooltip "DXF unavailable for legacy cuts".

## 11. Coordination

- **Steven (PR #215 / ARC-41 PR1):** founder confirms Steven is not actively working on follow-ups; PR A (ARC-41 PR2) belongs to this rollout.
- **Codex:** reviews this spec for scope, architecture, library choices, phasing. Reviews each PR before merge.
- **Kimi K2.6:** designs the gasket sub-tab UI and authors all TSX in `gasket-cutting/_components/` once visual design is approved by founder.
- **Founder:** reviews this spec (v2), signs off on Kimi's design before PR C TSX is written, answers the five Kimi open questions in §10, owns the CAM tool validation in PR D.

## 11.1 Codex review outcome (recorded for traceability)

Codex v1 review: **REJECT** — see `.claude/handoff/gasket-cutting-codex-review-result.md`. All HIGH/MED findings addressed by spec v2.

Codex v2 review: **APPROVE-WITH-NOTES** — see `.claude/handoff/gasket-cutting-codex-v2-review-result.md`. v1 findings CLOSED; four v2 notes applied inline:
- [MED] PR 0 helper checklist named explicitly in §7.0 (result.rs, polygon_slice callers, area math, buildPart zod, template-to-part, PartTemplate, pack-result-to-layout-model).
- [MED] Free-roam hole semantics resolved: holes are voids, placements inside allowed (jagua convention).
- [LOW] PDF regen reader path covered in §7.0 and PR 0c.
- [LOW] §8 PR A `dxf` → `dxf-parser` corrected.
- PR 0 staging: split into 0a/0b/0c per Codex recommendation (§8). Total PR count: 7.

Codex verdict line: _"No blocker to founder sign-off."_

## 12. Out of scope / future enhancements

- ASME B16.21 / B16.20 flange preset library (one-click "ANSI 150 #4" sizing).
- Per-part DXF layer naming for CAM workflows.
- Welding tabs, lead-in lines, kerf compensation in DXF output.
- Material-specific gasket recommendations (rubber compound chooser).
- Rust-side CAD parsing consolidation between web + desktop (ARC-93 shared crate).
- DWG support.
