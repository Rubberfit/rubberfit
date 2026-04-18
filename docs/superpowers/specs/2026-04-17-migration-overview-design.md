# REMA Portal Migration — Overview

**Status:** Approved scope and sequencing. Sub-project specs follow this document.
**Date:** 2026-04-17
**Author:** Claude + Gemini + Codex (parallel investigation)

## 1. Goal

Migrate REMA Portal from a Next.js web app to a native desktop application with an industry-standard, open-source-extractable algorithm layer. Priority #1 is nesting-engine efficiency.

## 2. Stack

| Layer | Tech | Notes |
|---|---|---|
| Frontend | React + TypeScript inside **Tauri** | Rust shell; replaces Next.js |
| Backend | **Rust** service process | Owns all Supabase access, exposes a narrow API to the frontend |
| Engine | **Rust** nesting engine | Built on `jagua-rs` (MPL-2.0) + `sparrow` (MIT) — continuous rotation, true NFP collision detection |
| DB/Auth | **Supabase** | Unchanged; access moves behind the Rust backend |
| Canvas (editor) | **Konva.js + react-konva** (MIT) + **Maker.js** (Apache-2.0) | CAD-style interactive editor; Maker.js handles DXF import/export |
| PDF export | **krilla + krilla-svg** (MIT/Apache) in Rust backend, `printpdf + svg2pdf` fallback | True vector SVG→PDF end-to-end; no rasterization |

## 3. Sub-projects (in order)

| # | Sub-project | Scope |
|---|---|---|
| **S1** | Canonical pipeline refactor (TS) | Collapse 7 shape→polygon paths + 2 NFP engines into one; introduce `IPackingService`; clean up duplication and dead code |
| **S2** | Rust nesting engine | Standalone crate set (see §5); replace TS engine behind `IPackingService` via Tauri command |
| **S3** | Rust backend service + Supabase | Port service/use-case layer; introduce entity layer; define the frontend-facing API |
| **S4** | Tauri shell | Wrap React app, wire Rust backend + engine, build + sign + release pipeline |
| **S5** | Interactive editor + vector export | Konva + Maker.js canvas, operator-aware scoring, vector PDF with programmatic close-ups, DXF import/export |

S3 and S4 can run in parallel once S2 is stable.

## 4. Design decisions locked in

- **Pack workflow:** users queue all items, click Pack, engine returns the optimal layout. No mid-loop UX.
- **Pack performance:** loader visible during packing. Modes: **Fast ~2s / Balanced ~10s / Thorough ~30s.** Streaming progress with `bestLayoutSoFar` per iteration. User can stop early and accept the best-so-far.
- **Rearrangement model:** user can freely drag placements in the editor for their own convenience (client-side only). Clicking Pack re-runs the engine and discards rearrangement. Engine never has memory of user moves.
- **Multi-sheet:** engine accepts a list of mixed-size stock pieces (`bins: Bin[]`) and packs across them. Remnants can be prioritized.
- **Rotation:** `allowRotation: boolean` per part. Engine does continuous rotation when allowed, flips on grain axis when `grainAxis` is set.
- **Concave collision:** forbid interlocking through concavities (matches physical cutting). Handled by the engine's collision detection.
- **Geometry model:** polygons everywhere in the canonical boundary. Optional `shapeSpec` UI hint for crisp primitive rendering.
- **Origin convention:** all canonical polygons normalized to (0,0) min-corner, CCW winding.

## 5. Open-source Rust crates to extract

All MIT or Apache-2.0. Extracted during or after S2.

### `rema-layout`
2D bin packing with MaxRects (all 5 Jylänki heuristics) + globally-best batch insertion + novel width-pair pre-pass + exhaustive last-sheet rotation search + metaheuristic (LNS + SA via sparrow). Ports of Jylänki (C++), rectpack (Python), maxrects-packer (TS), plus REMA's novel width-pair contribution.

### `rema-geom`
Computational geometry: bindings to Clipper2 (Boost license) for boolean ops + Minkowski; Andrew's convex hull; SAT overlap; primitive tessellation (rect, circle, trapezoid, annular sector); and the headline feature — **maximal inscribed rectangle extraction** (histogram + monotonic stack + plane-sweep optimization). No Rust crate currently offers the inscribed-rectangle solver.

### `rema-reorder`
Inventory math: EOQ, service-level safety stock, urgency ranking, value-score supplier selection, demand forecasting (Holt-Winters optional). Constants become injected parameters, not hardcoded.

Not extracted: a `rema-rbac` mini-crate. Too small (~15 lines) to justify a standalone repo.

## 6. Proprietary but re-implemented with optimized approach

Stays in the Rust backend service. Each gets an industry-standard rewrite during S3:

| Algorithm | Today | Rewrite approach |
|---|---|---|
| Strategy scoring | 6 heuristic strategies per rect, hand-tuned weights | Run actual Rust pack simulations (fast native engine makes this feasible) |
| Fabrication score | 0.4 / 0.2 / 0.2 / 0.2 weights | Learn weights from historical job outcomes, or tenant-config |
| Waste classification | Hardcoded 11.5×12 / 6×24 thresholds | Tenant config + demand-weighted ("is a size actually reusable given current demand?") |
| PO totals | Three 8% tax fallbacks | Single `ITaxService`; banker's rounding |
| Notifications | No rate-limit, no dedup | Token-bucket + content-hash dedup + alert coalescing |
| Tax lookup | 4-step fallback, hardcoded 8% | Same chain, single source of truth |

## 7. References

Investigation reports (produced during this brainstorm):

- Gemini — cut-planner + nesting architectural map
- Gemini — full-repo algorithm inventory for open-source extraction
- Codex — vendored Fit packer internals + canonical pipeline proposal
- Codex — use-case and service-layer deep dive
- Research — open-source 2D nesting engine comparison (selected jagua-rs + sparrow)
- Research — canvas + vector-PDF library comparison (selected Konva + Maker.js + krilla)

External references:

- jagua-rs: https://github.com/JeroenGar/jagua-rs (MPL-2.0)
- sparrow: https://github.com/JeroenGar/sparrow (MIT)
- Konva: https://konvajs.org (MIT)
- Maker.js: https://maker.js.org (Apache-2.0)
- krilla: https://github.com/LaurenzV/krilla (MIT/Apache)
- Clipper2: https://www.angusj.com/clipper2 (Boost)
- Jylänki MaxRects: https://github.com/juj/RectangleBinPack (public domain)

## 8. Out of scope for this program

- Cloud/multi-tenant redesign
- Any migration away from Supabase
- Mobile or web deployment (desktop-only)
- Real-time collaboration between operators
