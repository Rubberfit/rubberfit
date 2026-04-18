# S1 — Canonical Pipeline Refactor

**Status:** Approved design. Ready for implementation plan (`writing-plans` skill next).
**Date:** 2026-04-17
**Sub-project:** S1 of 5 (see `2026-04-17-migration-overview-design.md`)
**Target repo:** `/Users/danielmartinezjulio/Work/arc and anchor/rema-portal/`

## 1. Context

The cut-planner has seven places that re-derive the same shape polygon, two separate NFP engines with divergent conventions (CCW vs CW, radians vs integer rotation index, separate caches), and the interactive Pack flow bypasses the clean-architecture boundary entirely by importing `nesting/nfp-solver.ts` directly from a React hook.

Additionally the codebase carries several duplicated business-logic paths — three PO-number formats, three 8% tax fallbacks, two EOQ implementations, two supplier-selection heuristics — plus confirmed dead code.

S1 is a pure TypeScript refactor that:
1. Collapses all shape/polygon/NFP code paths into one canonical pipeline
2. Puts the packer behind `IPackingService` so the UI stops reaching past the architecture
3. Deletes confirmed dead code
4. Collapses duplicated business logic to a single source of truth
5. Establishes the boundary types S2's Rust engine will consume

S1 does not port anything to Rust, does not touch Tauri, does not build the editor or PDF export, and does not introduce a `src/entities/` layer. Those are S2, S3, S4, S5.

## 2. Canonical types

New file: `src/application/packing/types.ts`

```typescript
export interface Point2D {
  x: number
  y: number
}

export interface ShapeSpec {
  kind: "rect" | "circle" | "ngon" | "trapezoid" | "sector" | "dxf" | "svg" | "custom"
  params: Record<string, number | string>
}

export interface Part {
  shapeId: string
  quantity: number
  polygon: Point2D[]                  // CCW, normalized to (0,0) min-corner
  shapeSpec?: ShapeSpec               // optional UI rendering hint
  allowRotation: boolean
  grainAxis?: "width" | "length" | "none"
  difficulty?: number                 // 0-100, operator-skill signal
}

export interface Bin {
  binId: string
  width: number
  height: number
  kind: "fresh" | "remnant"
  priority?: number                   // higher = consume first
}

export interface PackRequest {
  bins: Bin[]
  clearance: number                   // inches
  items: Part[]
  operatorProfile?: {
    skills: string[]
    maxDifficulty: number
  }
  mode?: "fast" | "balanced" | "thorough"
  timeBudgetMs?: number               // overrides mode
  improvementBudgetMs?: number        // early stop if no improvement in N ms
  seed?: number
}

export interface Placement {
  shapeId: string
  instanceIndex: number
  binId: string
  x: number
  y: number
  rotationRad: number
  polygon: Point2D[]                  // final placed polygon, always populated
  width: number
  height: number
  difficulty?: number
}

export interface BinResult {
  binId: string
  usedArea: number
  wasteArea: number
  occupiedWidth: number
  occupiedHeight: number
  efficiency: number                  // 0-1
}

export interface PackResult {
  placements: Placement[]
  placedCount: number
  overflowCount: number
  perBin: BinResult[]
  totalUsedArea: number
  totalWasteArea: number
}

export interface PackProgress {
  jobId: string
  phase: "warmup" | "metaheuristic" | "polishing"
  iteration: number
  elapsedMs: number
  estimatedRemainingMs?: number
  canFinalize: boolean
  bestLayoutSoFar: PackResult
}
```

### Invariants

- `polygon` is always CCW with min-corner at (0,0). Any other winding or origin is a contract violation caught in `buildPart`.
- `polygon` is always populated in `Placement` — unlike today, no code path throws it away.
- `binId` on `Placement` always references a `Bin` in the same `PackRequest`.
- `operatorProfile` is advisory: the engine ranks layouts by operator-fit but does not reject a layout that needs a missing skill.
- Mode presets: `fast` → `timeBudgetMs: 2_000`, `balanced` → `10_000`, `thorough` → `30_000`. Explicit `timeBudgetMs` wins.

## 3. Canonical pipeline

```
ShapeSpec                → buildPart()              → Part
Part[] + Bin[] + opts    → buildPackRequest()       → PackRequest
PackRequest              → IPackingService.pack()   → PackResult  (streamed via PackProgress)
PackResult               → buildPlacementView()     → PlacementView (UI-shaped)
```

One function per edge. New files under `src/application/packing/`:

| File | Purpose | Replaces |
|---|---|---|
| `buildPart.ts` | `ShapeSpec → Part`. Dispatches to primitive tessellation, normalizes to (0,0) CCW, attaches `shapeSpec` as a render hint. | `simplePartToNestingParts`, `coneNfpPolygon`, `trapNfpPolygon`, `basePolygonForSpec`, `rotatePreviewItem`'s polygon rebuild, inline polygons in `preset-template-data-shapes` |
| `buildPackRequest.ts` | Assembles `PackRequest` from UI state (parts queue, available bins, mode, operator). | `NestingInput` and `MixedSpec` construction spread across `use-nfp-optimizer.ts`, `use-nesting-compute.ts`, shape-preview-advanced/basic/dispatch |
| `buildPlacementView.ts` | `PackResult → PlacementView`. PlacementView is the UI-shaped type consumed by `NestingVisualizer` and the renderer. | `nestingResultToPreviewItems`, `buildNfpPackedPreview`, `mixedResultToCandidate`, `applyTrapezoidFields` (deleted), `buildMultiPartPreviewFromCandidate` |

Primitive tessellation (rect, circle, N-gon, trapezoid, annular sector) stays in `nesting/shape-to-polygon.ts` during S1. It is deleted in S2 when `rema-geom` takes over.

## 4. Packing service boundary

### Interface

New file: `src/application/services/packing.service.interface.ts`

```typescript
export interface IPackingService {
  pack(
    request: PackRequest,
    onProgress?: (progress: PackProgress) => void
  ): Promise<PackResult>

  cancel(jobId: string): Promise<void>
}

export const PACKING_TOKENS = {
  IPackingService: Symbol.for("IPackingService"),
} as const
```

### Implementation

New file: `src/infrastructure/services/legacyPackingService.ts`

Thin adapter wrapping the existing TS engine. Responsibility:
1. Receive `PackRequest`, route to the correct internal engine:
   - Homogeneous items (one `shapeId`) → `nfp-greedy-placer.ts`
   - Mixed items with simple shapes → `nfp-solver.ts` (GA)
   - Mixed with cones/trapezoids → `mixed-nfp-placer.ts`
2. Convert legacy results (`NestingResult`, `GreedyPackResult`, `MixedPackResult`) to `PackResult`
3. Forward progress events into `PackProgress` (adapter-side synthesis — legacy engines don't stream, so S1's "progress" is a single event at completion for now; S2 replaces with real streaming)

DI registration in `di/di-registration.ts`:
```typescript
container.registerSingleton(PACKING_TOKENS.IPackingService, LegacyPackingService)
```

### Call site migration

`use-nfp-optimizer.ts` and `use-nesting-compute.ts` stop importing `nesting/nfp-solver.ts`, `nesting/nfp-greedy-placer.ts`, `nesting/mixed-nfp-placer.ts` directly. They resolve `IPackingService` via `resolveUseCase(PACKING_TOKENS.IPackingService)` and call `pack()`.

After S1, **no file under `app/` imports from `nesting/` directly.** The dependency graph is:

```
app/           →  src/application/packing/  →  src/application/services/  →  src/infrastructure/services/legacyPackingService  →  nesting/
```

## 5. Cleanup surface

### Confirmed dead code (delete)

- `nesting/vendor/fit/mathHelper.ts` — no importers (confirmed by grep)
- `app/dashboard/cut-planner/_components/use-nesting-compute.ts` — superseded; `NestingVisualizer.tsx` imports only `useNfpOptimizer`
- `NestingVisualizer.tsx` non-`simpleMode` return branch — never executes
- `proxy.ts` auth-bypass at lines 28 and 89 — matcher only includes `/dashboard/:path*`, never hit
- `src/infrastructure/services/emailService.ts` private `emailQueue` field — queued HTML is ignored
- `src/infrastructure/services/useRole.ts` — `authService` already loads roles
- `src/infrastructure/scripts/theme-boot.tsx` — `app/` copy is the one imported
- `src/infrastructure/services/README.md` — stale documentation
- `applyTrapezoidFields` in `app/dashboard/cut-planner/_components/nesting-nfp-helpers.ts:296` — actively harmful: throws away `placedPolygon`, forces re-tessellation downstream
- `materials` parameter in `src/application/use-cases/reorder/generate-reorder-suggestions.use-case.ts` — declared, never read

### Duplication to collapse (single source of truth)

| Today | After S1 |
|---|---|
| PO-number format in DB function + `purchaseOrderService.ts:447` + `reorderService.ts:384` (three different formats) | One format, DB trigger is canonical; services call a shared `generatePONumber()` helper |
| 8% tax fallback in `taxService.ts:28` + `reorderCalculations.ts:160` + `create-reorder-purchase-order.use-case.ts:53` | Only `taxService.ts:28`; use-case and reorder calc call `ITaxService` |
| EOQ in `reorderCalculations.ts:68` (90-day history) vs `generate-reorder-suggestions.use-case.ts:99` (hardcoded `DAILY_USAGE=10`) | Only `reorderCalculations.ts:68`; use-case injects it |
| Supplier selection: `calculateValueScore` vs `cheapest-per-sqft` | `calculateValueScore` only; cheapest-per-sqft path deleted |
| Shape→polygon (7 paths) | `buildPart` only |
| NFP engines (2) | `IPackingService` only; internal dispatch hidden |
| Roll decrement: app-side + DB trigger | DB trigger only; app-side delete |
| Notification queue: app insert + DB trigger insert (double-fire) | App-side insert only; disable DB trigger for queue |
| Supplier price-change side effects: app + DB trigger | DB trigger only; app-side delete |
| PDF methods on both `exportService` and `exportPdfService` | `IExportPdfService` only |
| `receivePurchaseOrder` on both `purchaseOrderService` and `purchaseOrderAnalytics.ts` | `purchaseOrderService` only; analytics delegates |
| `subtotal` arithmetic duplicated across create + update PO use-cases | Extract to `computePoSubtotal(items)` helper |

### Architectural fixes

- **Clean-architecture boundary violation** (the main S1 fix): interactive Pack currently reaches into `nesting/` from a React hook. After S1 it goes through `IPackingService`. This is the single biggest migration win — S2 can replace the implementation without touching any UI code.
- **Reverse dependency:** `src/infrastructure/services/visionExtractionService.ts` imports types from `app/dashboard/...`. Move shared types to `src/application/vision/types.ts` and re-export for UI.
- **Config drift:** `NEXT_PUBLIC_SUPABASE_*` (code) vs `SUPABASE_*` (README). Code wins; update `src/infrastructure/supabase/README.md`.
- **Missing config entry:** `visionExtractionService` calls an edge function not listed in `src/infrastructure/supabase/config.toml`. Add it.

## 6. Test strategy

No test framework currently. Introduce **Vitest** (TS-native, fast, zero Tauri friction later).

### Test suites

1. **Parity golden-file tests** — `tests/packing/parity/`
   - Known `PackRequest` fixtures fed to `LegacyPackingService`
   - Snapshot `PackResult` (sorted, with deterministic seed)
   - Run before and after S1 lands — byte-for-byte match proves no regression
   - At least 10 fixtures covering: single rect, multi-rect same size, rect grid, circle grid, cone array, trapezoid mix, multi-part mixed, multi-sheet with remnant, overflow case, zero items

2. **`buildPart` contract tests** — `tests/packing/buildPart.test.ts`
   - For every `ShapeSpec.kind`: polygon is CCW, `min(x) === 0`, `min(y) === 0`, no self-intersections, closed
   - Degenerate inputs (zero width/height, negative dims) throw explicit errors

3. **`buildPackRequest` contract tests**
   - Mode → timeBudgetMs conversion
   - Explicit `timeBudgetMs` overrides mode
   - Multi-bin ordering preserves `priority` then `kind: "remnant"`

4. **`IPackingService` integration tests**
   - Stub implementation returns canned `PackResult`; assert the adapter surface is called correctly from `use-nfp-optimizer`
   - DI resolution: `LegacyPackingService` is the bound implementation

5. **Cleanup verification**
   - `tests/cleanup.test.ts` fails the build if any deleted file path has an importer
   - `grep` for `applyTrapezoidFields`, `use-nesting-compute`, `mathHelper`, etc. — expect zero hits outside deleted files

### Test commands

Add to `package.json`:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:parity": "vitest run tests/packing/parity"
  }
}
```

Add a CI step (if CI exists): `npm run typecheck && npm run lint && npm run test && npm run build`.

## 7. Incremental rollout

S1 is not a big-bang rewrite. Order:

1. **Week 1 — Foundation**
   - Introduce `src/application/packing/types.ts`
   - Introduce `IPackingService` interface
   - Introduce `LegacyPackingService` adapter
   - Wire DI
   - No call-site migration yet. Legacy code keeps running.

2. **Week 2 — Parity tests**
   - Install Vitest
   - Write parity fixtures against current behavior
   - Golden-file snapshots committed
   - CI runs them

3. **Week 3 — buildPart + buildPackRequest + buildPlacementView**
   - Implement the three edge functions
   - Unit tests for each
   - Feature-flag off in call sites (still use legacy paths)

4. **Week 4 — Call-site migration**
   - Switch `use-nfp-optimizer.ts`, `use-nesting-compute.ts` (if not deleted), all shape-preview files to use `IPackingService`
   - Parity tests still pass
   - Delete dead code (one commit per deletion for easy revert)

5. **Week 5 — Duplication collapse**
   - PO number, tax, EOQ, supplier selection, notifications, rolls
   - Each collapse is a separate PR with parity tests
   - Coordinate DB migrations carefully (roll decrement, notification queue, supplier price-change triggers)

6. **Week 6 — Handoff**
   - `IPackingService` is the only boundary
   - Nothing in `app/` imports from `nesting/` directly
   - All duplicate code paths collapsed
   - Parity suite + typecheck + lint clean
   - Ready for S2

Each week is a milestone, not a hard deadline.

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Parity tests differ before/after adapter wrap (GA non-determinism) | Use fixed `seed` in every fixture; the legacy GA honors seeds. If any fixture is non-deterministic, it becomes a "tolerance snapshot" (within 2% efficiency). |
| Collapsing the notification queue duplication breaks alert delivery | Feature-flag the change; run both paths in parallel for one week with deduplication logging; only disable the DB trigger once app-side path proves reliable. |
| Roll decrement collapse — if DB trigger is wrong, inventory drifts | Write a reconciliation test: sum of `cuts.length_consumed` == difference in `rolls.current_length` since migration. Run nightly during transition. |
| `buildPart` CCW/origin normalization breaks subtle rendering | Parity tests catch this via `PackResult.placements[].polygon` snapshots. Any divergence in `buildPlacementView` output is a test failure. |
| PO-number migration affects existing records | Backfill script for existing PO numbers to the canonical format; soft-migrate (support both formats on read, write only the new format). |

## 9. Handoff to S2

At the end of S1:

- `src/application/packing/types.ts` is the boundary S2's Rust engine honors
- `LegacyPackingService` is the adapter to swap out
- Parity fixtures prove Rust output matches TS output (within acceptable tolerance)
- The UI is completely unaware of S2 happening — `use-nfp-optimizer.ts` keeps working

S2 introduces `RustPackingService` (a thin Tauri command wrapper around the `rema-layout` crate), registers it in DI, and deletes `LegacyPackingService` + `nesting/`. The UI doesn't change.

### What S1 did NOT accomplish (deferred to S2)

- Preview/viz helpers under `app/dashboard/cut-planner/_components/` (e.g., `nesting-shape-previews-*`, `nesting-preview-builders`, `nesting-packing-utils`) still import `@/nesting/types`, `@/nesting/shape-to-polygon`, `@/nesting/free-space`, `@/nesting/nfp-greedy-placer`, `@/nesting/mixed-nfp-placer`. These are 19 type and helper imports across 10 files. They're not part of the interactive Pack call path — they're separate preview/visualization computations.
- S2 will either (a) move these helpers into `rema-geom`/`rema-layout` Rust crates with TypeScript bindings, or (b) keep them as TypeScript preview helpers independent of the engine. Decision at S2 design time.

## 10. Open questions (resolved)

| Question | Resolution |
|---|---|
| Canonical polygons normalized to origin? | Yes, (0,0) min-corner, CCW winding |
| Rotation policy granularity? | `allowRotation: boolean` + optional `grainAxis` for grain-sensitive materials |
| Multi-sheet / gap-fill: engine or app? | Engine. Accepts `bins: Bin[]` with mixed sizes. |
| Offcut extraction shares engine precision rules? | Yes, via `rema-geom` crate in S2; non-issue in S1 (offcuts still in `free-space.ts`) |
| Concave collision? | Forbid interlocking (matches physical cutting) |
| Polygons everywhere? | Yes, with optional `shapeSpec` UI hint for crisp primitive rendering |

## 11. References

- Migration overview: `./2026-04-17-migration-overview-design.md`
- Codex deep dive: Fit packer internals + canonical pipeline proposal (this session)
- Gemini architecture map: cut-planner + nesting-engine call graph (this session)
- Gemini algorithm inventory: full-repo open-source candidates (this session)
- Codex use-case/service layer deep dive (this session)
- External: jagua-rs (MPL-2.0), sparrow (MIT), Clipper2 (Boost), Jylänki MaxRects (public domain)
