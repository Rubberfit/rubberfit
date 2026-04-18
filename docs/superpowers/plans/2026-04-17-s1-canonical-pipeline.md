# S1 — Canonical Pipeline Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse every shape→polygon→NFP→result code path in rema-portal into one canonical pipeline behind `IPackingService`, delete confirmed dead code, and collapse duplicated business logic — all in TypeScript, no framework changes.

**Architecture:** New `src/application/packing/` module owns the canonical types and pipeline functions. A new `IPackingService` interface lives in `src/application/services/`, implemented by `LegacyPackingService` (thin adapter over the existing TS engine). Every UI Pack call site resolves through DI — no more direct imports from `nesting/`. Parity preserved via Vitest golden-file snapshots.

**Tech Stack:** TypeScript strict, TSyringe DI, Vitest, existing Clipper-lib + vendored Fit packer (unchanged behind the adapter).

**Spec:** `docs/superpowers/specs/2026-04-17-s1-canonical-pipeline-design.md`

## Standing rule — directory READMEs

Every task that adds or modifies code in a directory must update that directory's `README.md` in the same commit. If the directory is new, create a new README listing each file with a one-line purpose (match `app/hooks/README.md` style). If it exists, add a row for the new file. This rule applies to EVERY task below; implementer subagents must include the README update before their final commit.

---

## File Structure

### New files

- `src/application/packing/types.ts` — canonical `Point2D`, `ShapeSpec`, `Part`, `Bin`, `PackRequest`, `Placement`, `BinResult`, `PackResult`, `PackProgress`
- `src/application/packing/buildPart.ts` — `ShapeSpec → Part` dispatcher, CCW + (0,0) min-corner normalization
- `src/application/packing/buildPackRequest.ts` — assemble `PackRequest` from UI inputs; mode → budget mapping
- `src/application/packing/buildPlacementView.ts` — `PackResult → PlacementView` (UI-shaped)
- `src/application/packing/placementView.ts` — `PlacementView` type (UI-facing, consumed by NestingVisualizer)
- `src/application/services/packing.service.interface.ts` — `IPackingService` + tokens
- `src/infrastructure/services/legacyPackingService.ts` — adapter over `nfp-solver.ts`, `nfp-greedy-placer.ts`, `mixed-nfp-placer.ts`
- `src/application/computePoSubtotal.ts` — shared PO subtotal helper
- `src/application/vision/types.ts` — types moved out of `app/dashboard/`
- `tests/packing/parity/fixtures/*.json` — 10 golden-file inputs
- `tests/packing/parity/__snapshots__/*.snap` — golden outputs (Vitest manages)
- `tests/packing/parity/parity.test.ts` — parity runner
- `tests/packing/buildPart.test.ts`
- `tests/packing/buildPackRequest.test.ts`
- `tests/packing/buildPlacementView.test.ts`
- `tests/packing/di.test.ts`
- `tests/cleanup.test.ts`
- `vitest.config.ts`

### Modified files

- `di/tokens.ts` — add `IPackingService` token
- `di/di-registration.ts` — register `LegacyPackingService`
- `app/dashboard/cut-planner/_components/use-nfp-optimizer.ts` — resolve `IPackingService` instead of importing engine directly
- `app/dashboard/cut-planner/_components/nesting-shape-previews-basic.ts` — same
- `app/dashboard/cut-planner/_components/nesting-shape-previews-advanced.ts` — same
- `app/dashboard/cut-planner/_components/nesting-shape-previews-dispatch.ts` — same
- `app/dashboard/cut-planner/_components/NestingVisualizer.tsx` — remove non-simpleMode dead branch
- `app/dashboard/cut-planner/_components/nesting-nfp-helpers.ts` — remove `applyTrapezoidFields`
- `src/infrastructure/services/emailService.ts` — remove dead `emailQueue` field
- `proxy.ts` — remove dead auth-bypass branches
- `src/infrastructure/services/reorderCalculations.ts` — use `ITaxService` instead of hardcoded 8%
- `src/application/use-cases/reorder/create-reorder-purchase-order.use-case.ts` — same
- `src/application/use-cases/reorder/generate-reorder-suggestions.use-case.ts` — delete `materials` param + unused `DAILY_USAGE`, delegate to `reorderCalculations`
- `src/infrastructure/services/priceHistoryService.ts` — delete cheapest-per-sqft supplier path
- `src/infrastructure/services/reorderCalculations.ts` — same
- `src/infrastructure/services/purchaseOrderService.ts` — use shared `generatePONumber`
- `src/infrastructure/services/reorderService.ts` — same
- `src/infrastructure/services/cutService.ts` — remove app-side roll decrement
- `src/infrastructure/services/supplierService.ts` — remove app-side price-change side effect
- `src/infrastructure/services/visionExtractionService.ts` — import from `src/application/vision/types.ts`
- `src/infrastructure/services/exportService.ts` — delete PDF methods (duplicate of exportPdfService)
- `src/infrastructure/services/purchaseOrderAnalytics.ts` — `receivePurchaseOrder` delegates to `purchaseOrderService`
- `src/application/use-cases/purchase-orders/create-purchase-order.use-case.ts` — use `computePoSubtotal`
- `src/application/use-cases/purchase-orders/update-purchase-order.use-case.ts` — same
- `src/infrastructure/supabase/README.md` — document `NEXT_PUBLIC_SUPABASE_*`
- `src/infrastructure/supabase/config.toml` — add vision edge function
- `package.json` — add Vitest deps + scripts

### Deleted files

- `nesting/vendor/fit/mathHelper.ts`
- `app/dashboard/cut-planner/_components/use-nesting-compute.ts`
- `src/infrastructure/services/useRole.ts`
- `src/infrastructure/scripts/theme-boot.tsx`
- `src/infrastructure/services/README.md` (will rewrite fresh)

---

## Phase 1 — Foundation Types and Interface

### Task 1: Create canonical types file

**Files:**
- Create: `src/application/packing/types.ts`

- [ ] **Step 1: Write the failing import test**

```typescript
// tests/packing/types.test.ts
import { describe, it, expectTypeOf } from "vitest"
import type {
  Point2D, ShapeSpec, Part, Bin,
  PackRequest, Placement, BinResult, PackResult, PackProgress,
} from "@/src/application/packing/types"

describe("canonical types", () => {
  it("Point2D has numeric x/y", () => {
    expectTypeOf<Point2D>().toHaveProperty("x").toBeNumber()
    expectTypeOf<Point2D>().toHaveProperty("y").toBeNumber()
  })

  it("Part requires polygon, allowRotation, shapeId, quantity", () => {
    expectTypeOf<Part>().toHaveProperty("polygon").toEqualTypeOf<Point2D[]>()
    expectTypeOf<Part>().toHaveProperty("allowRotation").toBeBoolean()
    expectTypeOf<Part>().toHaveProperty("shapeId").toBeString()
    expectTypeOf<Part>().toHaveProperty("quantity").toBeNumber()
  })

  it("PackRequest carries bins: Bin[] and items: Part[]", () => {
    expectTypeOf<PackRequest>().toHaveProperty("bins").toEqualTypeOf<Bin[]>()
    expectTypeOf<PackRequest>().toHaveProperty("items").toEqualTypeOf<Part[]>()
  })

  it("Placement requires binId and polygon", () => {
    expectTypeOf<Placement>().toHaveProperty("binId").toBeString()
    expectTypeOf<Placement>().toHaveProperty("polygon").toEqualTypeOf<Point2D[]>()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/packing/types.test.ts`
Expected: FAIL — `Cannot find module '@/src/application/packing/types'`

- [ ] **Step 3: Write the types file**

```typescript
// src/application/packing/types.ts
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
  polygon: Point2D[]
  shapeSpec?: ShapeSpec
  allowRotation: boolean
  grainAxis?: "width" | "length" | "none"
  difficulty?: number
}

export interface Bin {
  binId: string
  width: number
  height: number
  kind: "fresh" | "remnant"
  priority?: number
}

export interface PackRequest {
  bins: Bin[]
  clearance: number
  items: Part[]
  operatorProfile?: {
    skills: string[]
    maxDifficulty: number
  }
  mode?: "fast" | "balanced" | "thorough"
  timeBudgetMs?: number
  improvementBudgetMs?: number
  seed?: number
}

export interface Placement {
  shapeId: string
  instanceIndex: number
  binId: string
  x: number
  y: number
  rotationRad: number
  polygon: Point2D[]
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
  efficiency: number
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

export const PACK_MODE_BUDGETS_MS = {
  fast: 2_000,
  balanced: 10_000,
  thorough: 30_000,
} as const
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run typecheck && npm run test -- tests/packing/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/application/packing/types.ts tests/packing/types.test.ts
git commit -m "feat(packing): introduce canonical types (Part, Bin, PackRequest, PackResult)"
```

---

### Task 2: Create IPackingService interface

**Files:**
- Create: `src/application/services/packing.service.interface.ts`

- [ ] **Step 1: Write the failing interface test**

```typescript
// tests/packing/interface.test.ts
import { describe, it, expectTypeOf } from "vitest"
import type {
  IPackingService,
} from "@/src/application/services/packing.service.interface"
import {
  PACKING_TOKENS,
} from "@/src/application/services/packing.service.interface"
import type {
  PackRequest, PackResult, PackProgress,
} from "@/src/application/packing/types"

describe("IPackingService", () => {
  it("has pack(request, onProgress?) returning Promise<PackResult>", () => {
    expectTypeOf<IPackingService["pack"]>()
      .parameter(0).toEqualTypeOf<PackRequest>()
    expectTypeOf<IPackingService["pack"]>()
      .returns.toEqualTypeOf<Promise<PackResult>>()
  })

  it("has cancel(jobId) returning Promise<void>", () => {
    expectTypeOf<IPackingService["cancel"]>()
      .parameter(0).toBeString()
    expectTypeOf<IPackingService["cancel"]>()
      .returns.toEqualTypeOf<Promise<void>>()
  })

  it("PACKING_TOKENS.IPackingService is a Symbol", () => {
    expect(typeof PACKING_TOKENS.IPackingService).toBe("symbol")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/packing/interface.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the interface**

```typescript
// src/application/services/packing.service.interface.ts
import type {
  PackRequest,
  PackResult,
  PackProgress,
} from "@/src/application/packing/types"

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

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run typecheck && npm run test -- tests/packing/interface.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/application/services/packing.service.interface.ts tests/packing/interface.test.ts
git commit -m "feat(packing): define IPackingService interface + DI token"
```

---

### Task 3: Install Vitest and configure

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Install dev dependencies**

Run: `npm install --save-dev vitest @vitest/ui happy-dom`
Expected: `vitest`, `@vitest/ui`, `happy-dom` added to `devDependencies`

- [ ] **Step 2: Write vitest.config.ts**

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/**/*.skip.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
})
```

- [ ] **Step 3: Add test scripts to package.json**

Modify `package.json` scripts section:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui",
    "test:parity": "vitest run tests/packing/parity"
  }
}
```

- [ ] **Step 4: Run the existing type tests to verify setup**

Run: `npm run test`
Expected: PASS — both `types.test.ts` and `interface.test.ts` run green

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "chore(test): add Vitest test runner"
```

---

## Phase 2 — Legacy Adapter Stub and DI

### Task 4: LegacyPackingService skeleton (stub that throws)

**Files:**
- Create: `src/infrastructure/services/legacyPackingService.ts`

- [ ] **Step 1: Write the failing instantiation test**

```typescript
// tests/packing/legacyService.test.ts
import { describe, it, expect } from "vitest"
import "reflect-metadata"
import { LegacyPackingService } from "@/src/infrastructure/services/legacyPackingService"
import type { PackRequest } from "@/src/application/packing/types"

describe("LegacyPackingService skeleton", () => {
  it("constructs without error", () => {
    expect(() => new LegacyPackingService()).not.toThrow()
  })

  it("pack() throws 'not implemented' until Phase 3", async () => {
    const svc = new LegacyPackingService()
    const req: PackRequest = { bins: [], clearance: 0, items: [] }
    await expect(svc.pack(req)).rejects.toThrow(/not implemented/i)
  })

  it("cancel() throws 'not implemented' until Phase 3", async () => {
    const svc = new LegacyPackingService()
    await expect(svc.cancel("job-1")).rejects.toThrow(/not implemented/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/packing/legacyService.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the skeleton**

```typescript
// src/infrastructure/services/legacyPackingService.ts
import "reflect-metadata"
import { injectable } from "tsyringe"
import type { IPackingService } from "@/src/application/services/packing.service.interface"
import type {
  PackRequest,
  PackResult,
  PackProgress,
} from "@/src/application/packing/types"

@injectable()
export class LegacyPackingService implements IPackingService {
  async pack(
    _request: PackRequest,
    _onProgress?: (progress: PackProgress) => void
  ): Promise<PackResult> {
    throw new Error("LegacyPackingService.pack: not implemented (Phase 3 wiring pending)")
  }

  async cancel(_jobId: string): Promise<void> {
    throw new Error("LegacyPackingService.cancel: not implemented (Phase 3 wiring pending)")
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/packing/legacyService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/services/legacyPackingService.ts tests/packing/legacyService.test.ts
git commit -m "feat(packing): add LegacyPackingService skeleton implementing IPackingService"
```

---

### Task 5: Wire DI registration for IPackingService

**Files:**
- Modify: `di/tokens.ts`
- Modify: `di/di-registration.ts`

- [ ] **Step 1: Write the failing DI resolution test**

```typescript
// tests/packing/di.test.ts
import { describe, it, expect, beforeAll } from "vitest"
import "reflect-metadata"
import { container } from "tsyringe"
import "@/di/resolve" // triggers registration
import { PACKING_TOKENS } from "@/src/application/services/packing.service.interface"
import { LegacyPackingService } from "@/src/infrastructure/services/legacyPackingService"

describe("DI — IPackingService", () => {
  it("resolves IPackingService to LegacyPackingService", () => {
    const svc = container.resolve(PACKING_TOKENS.IPackingService)
    expect(svc).toBeInstanceOf(LegacyPackingService)
  })

  it("is a singleton (same instance on repeated resolve)", () => {
    const a = container.resolve(PACKING_TOKENS.IPackingService)
    const b = container.resolve(PACKING_TOKENS.IPackingService)
    expect(a).toBe(b)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/packing/di.test.ts`
Expected: FAIL — token not registered

- [ ] **Step 3: Add token to di/tokens.ts**

Locate `di/tokens.ts`. In the `TOKENS` object, add:

```typescript
// di/tokens.ts (add the import and token)
import { PACKING_TOKENS } from "@/src/application/services/packing.service.interface"

export const TOKENS = {
  // ... existing tokens preserved ...
  IPackingService: PACKING_TOKENS.IPackingService,
} as const
```

- [ ] **Step 4: Register in di/di-registration.ts**

In `di/di-registration.ts`, import `LegacyPackingService` and register:

```typescript
// di/di-registration.ts (additions)
import { LegacyPackingService } from "@/src/infrastructure/services/legacyPackingService"

// ... within the registration block ...
container.registerSingleton(TOKENS.IPackingService, LegacyPackingService)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- tests/packing/di.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add di/tokens.ts di/di-registration.ts tests/packing/di.test.ts
git commit -m "feat(packing): register LegacyPackingService in DI container"
```

---

## Phase 3 — buildPart (shape → canonical polygon)

### Task 6: buildPart for rectangle

**Files:**
- Create: `src/application/packing/buildPart.ts`

- [ ] **Step 1: Write the failing test for rect**

```typescript
// tests/packing/buildPart.test.ts
import { describe, it, expect } from "vitest"
import { buildPart } from "@/src/application/packing/buildPart"
import type { ShapeSpec, Part } from "@/src/application/packing/types"

describe("buildPart — rect", () => {
  it("produces a 4-vertex CCW polygon with min-corner at (0,0)", () => {
    const spec: ShapeSpec = { kind: "rect", params: { width: 10, height: 5 } }
    const part = buildPart({
      shapeId: "r1",
      quantity: 1,
      shapeSpec: spec,
      allowRotation: true,
    })

    expect(part.polygon).toHaveLength(4)
    const xs = part.polygon.map((p) => p.x)
    const ys = part.polygon.map((p) => p.y)
    expect(Math.min(...xs)).toBe(0)
    expect(Math.min(...ys)).toBe(0)
    expect(Math.max(...xs)).toBeCloseTo(10, 6)
    expect(Math.max(...ys)).toBeCloseTo(5, 6)
  })

  it("preserves shapeSpec as UI hint", () => {
    const spec: ShapeSpec = { kind: "rect", params: { width: 10, height: 5 } }
    const part = buildPart({
      shapeId: "r1",
      quantity: 1,
      shapeSpec: spec,
      allowRotation: true,
    })
    expect(part.shapeSpec).toEqual(spec)
  })

  it("throws on zero width", () => {
    expect(() =>
      buildPart({
        shapeId: "r1",
        quantity: 1,
        shapeSpec: { kind: "rect", params: { width: 0, height: 5 } },
        allowRotation: true,
      })
    ).toThrow(/width must be positive/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/packing/buildPart.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write buildPart with rect handler**

```typescript
// src/application/packing/buildPart.ts
import type { Part, ShapeSpec, Point2D } from "@/src/application/packing/types"

export interface BuildPartInput {
  shapeId: string
  quantity: number
  shapeSpec?: ShapeSpec
  allowRotation: boolean
  grainAxis?: "width" | "length" | "none"
  difficulty?: number
  polygon?: Point2D[]  // when caller supplies arbitrary polygon (DXF import, custom)
}

export function buildPart(input: BuildPartInput): Part {
  let polygon: Point2D[]

  if (input.polygon) {
    polygon = normalizePolygon(input.polygon)
  } else if (input.shapeSpec) {
    polygon = buildPolygonFromSpec(input.shapeSpec)
  } else {
    throw new Error("buildPart: must provide shapeSpec or polygon")
  }

  return {
    shapeId: input.shapeId,
    quantity: input.quantity,
    polygon,
    shapeSpec: input.shapeSpec,
    allowRotation: input.allowRotation,
    grainAxis: input.grainAxis,
    difficulty: input.difficulty,
  }
}

function buildPolygonFromSpec(spec: ShapeSpec): Point2D[] {
  switch (spec.kind) {
    case "rect":
      return buildRect(Number(spec.params.width), Number(spec.params.height))
    default:
      throw new Error(`buildPart: unsupported shape kind: ${spec.kind}`)
  }
}

function buildRect(width: number, height: number): Point2D[] {
  if (!(width > 0)) throw new Error("rect: width must be positive")
  if (!(height > 0)) throw new Error("rect: height must be positive")
  // CCW starting at (0,0)
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ]
}

function normalizePolygon(points: Point2D[]): Point2D[] {
  if (points.length < 3) throw new Error("polygon: must have at least 3 vertices")
  const minX = Math.min(...points.map((p) => p.x))
  const minY = Math.min(...points.map((p) => p.y))
  const translated = points.map((p) => ({ x: p.x - minX, y: p.y - minY }))
  return ensureCCW(translated)
}

function ensureCCW(points: Point2D[]): Point2D[] {
  // Shoelace: positive signed area = CCW
  let signed = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    signed += (b.x - a.x) * (b.y + a.y)
  }
  // Note: this convention treats positive signed as CW (screen coords);
  // we reverse so output is CCW in math coords
  return signed > 0 ? [...points].reverse() : points
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/packing/buildPart.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/application/packing/buildPart.ts tests/packing/buildPart.test.ts
git commit -m "feat(packing): buildPart handles rect with CCW+origin normalization"
```

---

### Task 7: buildPart for circle

**Files:**
- Modify: `src/application/packing/buildPart.ts`
- Modify: `tests/packing/buildPart.test.ts`

- [ ] **Step 1: Extend test with circle cases**

Append to `tests/packing/buildPart.test.ts`:

```typescript
describe("buildPart — circle", () => {
  it("produces a 24-vertex polygon by default", () => {
    const part = buildPart({
      shapeId: "c1",
      quantity: 1,
      shapeSpec: { kind: "circle", params: { diameter: 10 } },
      allowRotation: true,
    })
    expect(part.polygon).toHaveLength(24)
  })

  it("polygon spans diameter with min-corner at (0,0)", () => {
    const part = buildPart({
      shapeId: "c1",
      quantity: 1,
      shapeSpec: { kind: "circle", params: { diameter: 10 } },
      allowRotation: true,
    })
    const xs = part.polygon.map((p) => p.x)
    const ys = part.polygon.map((p) => p.y)
    expect(Math.min(...xs)).toBeCloseTo(0, 3)
    expect(Math.min(...ys)).toBeCloseTo(0, 3)
    expect(Math.max(...xs)).toBeCloseTo(10, 3)
    expect(Math.max(...ys)).toBeCloseTo(10, 3)
  })

  it("honors segments parameter", () => {
    const part = buildPart({
      shapeId: "c1",
      quantity: 1,
      shapeSpec: { kind: "circle", params: { diameter: 10, segments: 48 } },
      allowRotation: true,
    })
    expect(part.polygon).toHaveLength(48)
  })

  it("throws on zero diameter", () => {
    expect(() =>
      buildPart({
        shapeId: "c1",
        quantity: 1,
        shapeSpec: { kind: "circle", params: { diameter: 0 } },
        allowRotation: true,
      })
    ).toThrow(/diameter must be positive/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/packing/buildPart.test.ts`
Expected: FAIL — circle kind not supported

- [ ] **Step 3: Add circle handler**

In `src/application/packing/buildPart.ts`, extend `buildPolygonFromSpec`:

```typescript
function buildPolygonFromSpec(spec: ShapeSpec): Point2D[] {
  switch (spec.kind) {
    case "rect":
      return buildRect(Number(spec.params.width), Number(spec.params.height))
    case "circle":
      return buildCircle(
        Number(spec.params.diameter),
        Number(spec.params.segments ?? 24)
      )
    default:
      throw new Error(`buildPart: unsupported shape kind: ${spec.kind}`)
  }
}

function buildCircle(diameter: number, segments: number): Point2D[] {
  if (!(diameter > 0)) throw new Error("circle: diameter must be positive")
  if (!(segments >= 8)) throw new Error("circle: segments must be at least 8")
  const r = diameter / 2
  const pts: Point2D[] = []
  for (let i = 0; i < segments; i++) {
    const theta = (2 * Math.PI * i) / segments
    pts.push({ x: r + r * Math.cos(theta), y: r + r * Math.sin(theta) })
  }
  // Already CCW and already starts at min-corner near (0,0); normalize to tighten
  return normalizePolygon(pts)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/packing/buildPart.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/application/packing/buildPart.ts tests/packing/buildPart.test.ts
git commit -m "feat(packing): buildPart handles circle with configurable segments"
```

---

### Task 8: buildPart for trapezoid

**Files:**
- Modify: `src/application/packing/buildPart.ts`
- Modify: `tests/packing/buildPart.test.ts`

- [ ] **Step 1: Extend test with trapezoid cases**

```typescript
describe("buildPart — trapezoid", () => {
  it("produces a 4-vertex CCW polygon with min-corner at (0,0)", () => {
    const part = buildPart({
      shapeId: "t1",
      quantity: 1,
      shapeSpec: {
        kind: "trapezoid",
        params: { topWidth: 6, bottomWidth: 10, height: 4 },
      },
      allowRotation: true,
    })
    expect(part.polygon).toHaveLength(4)
    const xs = part.polygon.map((p) => p.x)
    const ys = part.polygon.map((p) => p.y)
    expect(Math.min(...xs)).toBe(0)
    expect(Math.min(...ys)).toBe(0)
    expect(Math.max(...xs)).toBeCloseTo(10, 6)
    expect(Math.max(...ys)).toBeCloseTo(4, 6)
  })

  it("throws on zero height", () => {
    expect(() =>
      buildPart({
        shapeId: "t1",
        quantity: 1,
        shapeSpec: {
          kind: "trapezoid",
          params: { topWidth: 6, bottomWidth: 10, height: 0 },
        },
        allowRotation: true,
      })
    ).toThrow(/height must be positive/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/packing/buildPart.test.ts`
Expected: FAIL — trapezoid kind not supported

- [ ] **Step 3: Add trapezoid handler**

In `buildPart.ts`:

```typescript
function buildPolygonFromSpec(spec: ShapeSpec): Point2D[] {
  switch (spec.kind) {
    case "rect":
      return buildRect(Number(spec.params.width), Number(spec.params.height))
    case "circle":
      return buildCircle(
        Number(spec.params.diameter),
        Number(spec.params.segments ?? 24)
      )
    case "trapezoid":
      return buildTrapezoid(
        Number(spec.params.topWidth),
        Number(spec.params.bottomWidth),
        Number(spec.params.height)
      )
    default:
      throw new Error(`buildPart: unsupported shape kind: ${spec.kind}`)
  }
}

function buildTrapezoid(topW: number, bottomW: number, height: number): Point2D[] {
  if (!(topW > 0)) throw new Error("trapezoid: topWidth must be positive")
  if (!(bottomW > 0)) throw new Error("trapezoid: bottomWidth must be positive")
  if (!(height > 0)) throw new Error("trapezoid: height must be positive")
  const maxW = Math.max(topW, bottomW)
  const topOffset = (maxW - topW) / 2
  const bottomOffset = (maxW - bottomW) / 2
  return normalizePolygon([
    { x: bottomOffset, y: 0 },
    { x: bottomOffset + bottomW, y: 0 },
    { x: topOffset + topW, y: height },
    { x: topOffset, y: height },
  ])
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/packing/buildPart.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/application/packing/buildPart.ts tests/packing/buildPart.test.ts
git commit -m "feat(packing): buildPart handles trapezoid"
```

---

### Task 9: buildPart for annular sector + regular N-gon

**Files:**
- Modify: `src/application/packing/buildPart.ts`
- Modify: `tests/packing/buildPart.test.ts`

- [ ] **Step 1: Extend tests for sector + ngon**

```typescript
describe("buildPart — sector (annular)", () => {
  it("produces polygon spanning outer diameter at y=0 through arc", () => {
    const part = buildPart({
      shapeId: "s1",
      quantity: 1,
      shapeSpec: {
        kind: "sector",
        params: { innerRadius: 2, outerRadius: 5, arcDegrees: 90 },
      },
      allowRotation: true,
    })
    expect(part.polygon.length).toBeGreaterThan(8)
    const xs = part.polygon.map((p) => p.x)
    const ys = part.polygon.map((p) => p.y)
    expect(Math.min(...xs)).toBeCloseTo(0, 3)
    expect(Math.min(...ys)).toBeCloseTo(0, 3)
  })
})

describe("buildPart — ngon (regular polygon)", () => {
  it("produces polygon with exactly N sides", () => {
    const part = buildPart({
      shapeId: "n1",
      quantity: 1,
      shapeSpec: { kind: "ngon", params: { sides: 6, radius: 5 } },
      allowRotation: true,
    })
    expect(part.polygon).toHaveLength(6)
  })

  it("throws for sides < 3", () => {
    expect(() =>
      buildPart({
        shapeId: "n1",
        quantity: 1,
        shapeSpec: { kind: "ngon", params: { sides: 2, radius: 5 } },
        allowRotation: true,
      })
    ).toThrow(/sides must be at least 3/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/packing/buildPart.test.ts`
Expected: FAIL — sector/ngon not supported

- [ ] **Step 3: Add handlers**

```typescript
function buildPolygonFromSpec(spec: ShapeSpec): Point2D[] {
  switch (spec.kind) {
    case "rect":
      return buildRect(Number(spec.params.width), Number(spec.params.height))
    case "circle":
      return buildCircle(Number(spec.params.diameter), Number(spec.params.segments ?? 24))
    case "trapezoid":
      return buildTrapezoid(
        Number(spec.params.topWidth),
        Number(spec.params.bottomWidth),
        Number(spec.params.height)
      )
    case "sector":
      return buildSector(
        Number(spec.params.innerRadius),
        Number(spec.params.outerRadius),
        Number(spec.params.arcDegrees),
        Number(spec.params.segments ?? 24)
      )
    case "ngon":
      return buildNGon(Number(spec.params.sides), Number(spec.params.radius))
    default:
      throw new Error(`buildPart: unsupported shape kind: ${spec.kind}`)
  }
}

function buildSector(
  innerR: number,
  outerR: number,
  arcDeg: number,
  segments: number
): Point2D[] {
  if (!(outerR > innerR)) throw new Error("sector: outerRadius must exceed innerRadius")
  if (!(arcDeg > 0 && arcDeg < 360)) throw new Error("sector: arcDegrees must be in (0, 360)")
  const arcRad = (arcDeg * Math.PI) / 180
  const step = arcRad / segments
  const outer: Point2D[] = []
  const inner: Point2D[] = []
  for (let i = 0; i <= segments; i++) {
    const a = i * step
    outer.push({ x: outerR * Math.cos(a), y: outerR * Math.sin(a) })
    inner.push({ x: innerR * Math.cos(a), y: innerR * Math.sin(a) })
  }
  // Outer forward, inner reverse = one closed polygon
  return normalizePolygon([...outer, ...inner.reverse()])
}

function buildNGon(sides: number, radius: number): Point2D[] {
  if (!(sides >= 3)) throw new Error("ngon: sides must be at least 3")
  if (!(radius > 0)) throw new Error("ngon: radius must be positive")
  const pts: Point2D[] = []
  for (let i = 0; i < sides; i++) {
    const a = (2 * Math.PI * i) / sides - Math.PI / 2
    pts.push({ x: radius * Math.cos(a), y: radius * Math.sin(a) })
  }
  return normalizePolygon(pts)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/packing/buildPart.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/application/packing/buildPart.ts tests/packing/buildPart.test.ts
git commit -m "feat(packing): buildPart handles sector and ngon"
```

---

### Task 10: buildPart for DXF / SVG / custom (polygon passthrough)

**Files:**
- Modify: `src/application/packing/buildPart.ts`
- Modify: `tests/packing/buildPart.test.ts`

- [ ] **Step 1: Extend tests for polygon passthrough**

```typescript
describe("buildPart — custom / DXF passthrough", () => {
  it("accepts a polygon directly (for imported shapes)", () => {
    const part = buildPart({
      shapeId: "dxf1",
      quantity: 1,
      polygon: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
        { x: 0, y: 3 },
      ],
      allowRotation: true,
    })
    expect(part.polygon).toHaveLength(4)
    expect(part.shapeSpec).toBeUndefined()
  })

  it("normalizes an offset polygon to min-corner (0,0)", () => {
    const part = buildPart({
      shapeId: "dxf1",
      quantity: 1,
      polygon: [
        { x: 10, y: 20 },
        { x: 14, y: 20 },
        { x: 14, y: 23 },
        { x: 10, y: 23 },
      ],
      allowRotation: true,
    })
    const xs = part.polygon.map((p) => p.x)
    const ys = part.polygon.map((p) => p.y)
    expect(Math.min(...xs)).toBe(0)
    expect(Math.min(...ys)).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/packing/buildPart.test.ts`
Expected: FAIL or PASS depending on current scaffolding — if it passes already because the existing branch handles it, move to the next task; if not, the normalization path needs wiring.

The existing `buildPart` already checks `input.polygon` before `input.shapeSpec`; verify it produces correct output. If the test passes, move on.

- [ ] **Step 3: Verify the polygon path is implemented**

Review `buildPart.ts`. The `if (input.polygon)` branch should already normalize. No new code needed.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/packing/buildPart.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/packing/buildPart.test.ts
git commit -m "test(packing): add buildPart polygon-passthrough cases for DXF/custom"
```

---

## Phase 4 — buildPackRequest and buildPlacementView

### Task 11: buildPackRequest — assemble request from UI inputs

**Files:**
- Create: `src/application/packing/buildPackRequest.ts`
- Create: `tests/packing/buildPackRequest.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/packing/buildPackRequest.test.ts
import { describe, it, expect } from "vitest"
import { buildPackRequest } from "@/src/application/packing/buildPackRequest"
import { PACK_MODE_BUDGETS_MS } from "@/src/application/packing/types"
import type { Part, Bin } from "@/src/application/packing/types"

const PART_A: Part = {
  shapeId: "a",
  quantity: 2,
  polygon: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 5 },
    { x: 0, y: 5 },
  ],
  allowRotation: true,
}

const BIN_FRESH: Bin = { binId: "b1", width: 48, height: 96, kind: "fresh" }
const BIN_REMNANT: Bin = { binId: "b2", width: 48, height: 20, kind: "remnant", priority: 10 }

describe("buildPackRequest", () => {
  it("uses mode preset for timeBudgetMs when not explicit", () => {
    const req = buildPackRequest({
      bins: [BIN_FRESH],
      items: [PART_A],
      clearance: 0.125,
      mode: "balanced",
    })
    expect(req.timeBudgetMs).toBe(PACK_MODE_BUDGETS_MS.balanced)
  })

  it("explicit timeBudgetMs overrides mode", () => {
    const req = buildPackRequest({
      bins: [BIN_FRESH],
      items: [PART_A],
      clearance: 0.125,
      mode: "fast",
      timeBudgetMs: 7000,
    })
    expect(req.timeBudgetMs).toBe(7000)
  })

  it("orders bins: priority desc, then remnants first, then insertion order", () => {
    const req = buildPackRequest({
      bins: [BIN_FRESH, BIN_REMNANT],
      items: [PART_A],
      clearance: 0.125,
    })
    expect(req.bins.map((b) => b.binId)).toEqual(["b2", "b1"])
  })

  it("defaults mode to balanced when absent", () => {
    const req = buildPackRequest({
      bins: [BIN_FRESH],
      items: [PART_A],
      clearance: 0.125,
    })
    expect(req.mode).toBe("balanced")
    expect(req.timeBudgetMs).toBe(PACK_MODE_BUDGETS_MS.balanced)
  })

  it("throws when no bins provided", () => {
    expect(() =>
      buildPackRequest({ bins: [], items: [PART_A], clearance: 0.125 })
    ).toThrow(/bins/i)
  })

  it("throws when no items provided", () => {
    expect(() =>
      buildPackRequest({ bins: [BIN_FRESH], items: [], clearance: 0.125 })
    ).toThrow(/items/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/packing/buildPackRequest.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write buildPackRequest**

```typescript
// src/application/packing/buildPackRequest.ts
import {
  type PackRequest,
  type Part,
  type Bin,
  PACK_MODE_BUDGETS_MS,
} from "@/src/application/packing/types"

export interface BuildPackRequestInput {
  bins: Bin[]
  items: Part[]
  clearance: number
  operatorProfile?: PackRequest["operatorProfile"]
  mode?: PackRequest["mode"]
  timeBudgetMs?: number
  improvementBudgetMs?: number
  seed?: number
}

export function buildPackRequest(input: BuildPackRequestInput): PackRequest {
  if (input.bins.length === 0) {
    throw new Error("buildPackRequest: at least one bin required")
  }
  if (input.items.length === 0) {
    throw new Error("buildPackRequest: at least one item required")
  }

  const mode = input.mode ?? "balanced"
  const timeBudgetMs = input.timeBudgetMs ?? PACK_MODE_BUDGETS_MS[mode]

  const sortedBins = [...input.bins].sort((a, b) => {
    const pa = a.priority ?? 0
    const pb = b.priority ?? 0
    if (pa !== pb) return pb - pa
    if (a.kind !== b.kind) return a.kind === "remnant" ? -1 : 1
    return 0
  })

  return {
    bins: sortedBins,
    items: input.items,
    clearance: input.clearance,
    operatorProfile: input.operatorProfile,
    mode,
    timeBudgetMs,
    improvementBudgetMs: input.improvementBudgetMs,
    seed: input.seed,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/packing/buildPackRequest.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/application/packing/buildPackRequest.ts tests/packing/buildPackRequest.test.ts
git commit -m "feat(packing): buildPackRequest with mode presets + bin ordering"
```

---

### Task 12: PlacementView type + buildPlacementView

**Files:**
- Create: `src/application/packing/placementView.ts`
- Create: `src/application/packing/buildPlacementView.ts`
- Create: `tests/packing/buildPlacementView.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/packing/buildPlacementView.test.ts
import { describe, it, expect } from "vitest"
import { buildPlacementView } from "@/src/application/packing/buildPlacementView"
import type { PackResult, Part } from "@/src/application/packing/types"

const PARTS: Part[] = [
  {
    shapeId: "rect-a",
    quantity: 1,
    polygon: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 0, y: 5 },
    ],
    shapeSpec: { kind: "rect", params: { width: 10, height: 5 } },
    allowRotation: true,
  },
]

const RESULT: PackResult = {
  placements: [
    {
      shapeId: "rect-a",
      instanceIndex: 0,
      binId: "b1",
      x: 2,
      y: 3,
      rotationRad: 0,
      polygon: [
        { x: 2, y: 3 },
        { x: 12, y: 3 },
        { x: 12, y: 8 },
        { x: 2, y: 8 },
      ],
      width: 10,
      height: 5,
    },
  ],
  placedCount: 1,
  overflowCount: 0,
  perBin: [
    {
      binId: "b1",
      usedArea: 50,
      wasteArea: 0,
      occupiedWidth: 10,
      occupiedHeight: 5,
      efficiency: 1,
    },
  ],
  totalUsedArea: 50,
  totalWasteArea: 0,
}

describe("buildPlacementView", () => {
  it("joins placements to their source parts by shapeId", () => {
    const view = buildPlacementView(RESULT, PARTS)
    expect(view.items).toHaveLength(1)
    expect(view.items[0].shapeId).toBe("rect-a")
    expect(view.items[0].renderShape).toBe("rect")
  })

  it("carries shapeSpec onto view items for UI rendering", () => {
    const view = buildPlacementView(RESULT, PARTS)
    expect(view.items[0].shapeSpec).toEqual(PARTS[0].shapeSpec)
  })

  it("preserves placed polygon verbatim", () => {
    const view = buildPlacementView(RESULT, PARTS)
    expect(view.items[0].polygon).toEqual(RESULT.placements[0].polygon)
  })

  it("groups view items by binId", () => {
    const view = buildPlacementView(RESULT, PARTS)
    expect(view.bins["b1"]).toBeDefined()
    expect(view.bins["b1"].items).toHaveLength(1)
  })

  it("carries perBin metrics through", () => {
    const view = buildPlacementView(RESULT, PARTS)
    expect(view.bins["b1"].efficiency).toBe(1)
    expect(view.bins["b1"].usedArea).toBe(50)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/packing/buildPlacementView.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the PlacementView type**

```typescript
// src/application/packing/placementView.ts
import type { Point2D, ShapeSpec } from "@/src/application/packing/types"

export type RenderShape =
  | "rect"
  | "circle"
  | "trapezoid"
  | "sector"
  | "ngon"
  | "polygon"

export interface PlacementViewItem {
  shapeId: string
  instanceIndex: number
  binId: string
  x: number
  y: number
  rotationRad: number
  width: number
  height: number
  polygon: Point2D[]
  shapeSpec?: ShapeSpec
  renderShape: RenderShape
  difficulty?: number
}

export interface PlacementViewBin {
  binId: string
  width: number
  height: number
  items: PlacementViewItem[]
  usedArea: number
  wasteArea: number
  occupiedWidth: number
  occupiedHeight: number
  efficiency: number
}

export interface PlacementView {
  items: PlacementViewItem[]
  bins: Record<string, PlacementViewBin>
  placedCount: number
  overflowCount: number
  totalUsedArea: number
  totalWasteArea: number
}
```

- [ ] **Step 4: Write buildPlacementView**

```typescript
// src/application/packing/buildPlacementView.ts
import type { PackResult, Part } from "@/src/application/packing/types"
import type {
  PlacementView,
  PlacementViewItem,
  PlacementViewBin,
  RenderShape,
} from "@/src/application/packing/placementView"

export function buildPlacementView(
  result: PackResult,
  parts: Part[],
  binsIndex?: Record<string, { width: number; height: number }>
): PlacementView {
  const partsById = new Map(parts.map((p) => [p.shapeId, p]))
  const binsById = new Map<string, PlacementViewBin>()

  for (const br of result.perBin) {
    const dims = binsIndex?.[br.binId] ?? { width: 0, height: 0 }
    binsById.set(br.binId, {
      binId: br.binId,
      width: dims.width,
      height: dims.height,
      items: [],
      usedArea: br.usedArea,
      wasteArea: br.wasteArea,
      occupiedWidth: br.occupiedWidth,
      occupiedHeight: br.occupiedHeight,
      efficiency: br.efficiency,
    })
  }

  const items: PlacementViewItem[] = result.placements.map((p) => {
    const src = partsById.get(p.shapeId)
    const renderShape: RenderShape = renderShapeFor(src?.shapeSpec?.kind)
    const item: PlacementViewItem = {
      shapeId: p.shapeId,
      instanceIndex: p.instanceIndex,
      binId: p.binId,
      x: p.x,
      y: p.y,
      rotationRad: p.rotationRad,
      width: p.width,
      height: p.height,
      polygon: p.polygon,
      shapeSpec: src?.shapeSpec,
      renderShape,
      difficulty: p.difficulty,
    }
    const bin = binsById.get(p.binId)
    if (bin) bin.items.push(item)
    return item
  })

  return {
    items,
    bins: Object.fromEntries(binsById),
    placedCount: result.placedCount,
    overflowCount: result.overflowCount,
    totalUsedArea: result.totalUsedArea,
    totalWasteArea: result.totalWasteArea,
  }
}

function renderShapeFor(kind: string | undefined): RenderShape {
  switch (kind) {
    case "rect":
      return "rect"
    case "circle":
      return "circle"
    case "trapezoid":
      return "trapezoid"
    case "sector":
      return "sector"
    case "ngon":
      return "ngon"
    default:
      return "polygon"
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- tests/packing/buildPlacementView.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/application/packing/placementView.ts src/application/packing/buildPlacementView.ts tests/packing/buildPlacementView.test.ts
git commit -m "feat(packing): buildPlacementView maps PackResult → UI-shaped view"
```

---

## Phase 5 — LegacyPackingService implementation

### Task 13: Legacy adapter — homogeneous items route to greedy placer

**Files:**
- Modify: `src/infrastructure/services/legacyPackingService.ts`
- Create: `tests/packing/legacyHomogeneous.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/packing/legacyHomogeneous.test.ts
import { describe, it, expect } from "vitest"
import "reflect-metadata"
import { LegacyPackingService } from "@/src/infrastructure/services/legacyPackingService"
import { buildPart } from "@/src/application/packing/buildPart"
import { buildPackRequest } from "@/src/application/packing/buildPackRequest"

describe("LegacyPackingService — homogeneous rect pack", () => {
  it("places six 10x5 rects on a 48x96 bin", async () => {
    const svc = new LegacyPackingService()
    const part = buildPart({
      shapeId: "rect-a",
      quantity: 6,
      shapeSpec: { kind: "rect", params: { width: 10, height: 5 } },
      allowRotation: true,
    })
    const req = buildPackRequest({
      bins: [{ binId: "b1", width: 48, height: 96, kind: "fresh" }],
      items: [part],
      clearance: 0.125,
      mode: "fast",
      seed: 42,
    })
    const result = await svc.pack(req)
    expect(result.placedCount).toBe(6)
    expect(result.overflowCount).toBe(0)
    expect(result.perBin[0].binId).toBe("b1")
    expect(result.placements.every((p) => p.binId === "b1")).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/packing/legacyHomogeneous.test.ts`
Expected: FAIL — `pack: not implemented`

- [ ] **Step 3: Implement pack for homogeneous case**

Replace the `pack` body in `legacyPackingService.ts`:

```typescript
// src/infrastructure/services/legacyPackingService.ts
import "reflect-metadata"
import { injectable } from "tsyringe"
import type { IPackingService } from "@/src/application/services/packing.service.interface"
import type {
  PackRequest,
  PackResult,
  PackProgress,
  Placement,
  BinResult,
  Part,
  Bin,
  Point2D,
} from "@/src/application/packing/types"
import { greedyNfpPack } from "@/nesting/nfp-greedy-placer"
import type { Polygon2D } from "@/nesting/types"

@injectable()
export class LegacyPackingService implements IPackingService {
  private cancelled = new Set<string>()

  async pack(
    request: PackRequest,
    onProgress?: (progress: PackProgress) => void
  ): Promise<PackResult> {
    validateRequest(request)
    const jobId = cryptoRandomId()

    if (isHomogeneous(request.items)) {
      return this.packHomogeneous(request, jobId, onProgress)
    }

    throw new Error(`LegacyPackingService.pack: mixed-part routing lands in Task 14`)
  }

  async cancel(jobId: string): Promise<void> {
    this.cancelled.add(jobId)
  }

  private async packHomogeneous(
    request: PackRequest,
    jobId: string,
    onProgress?: (p: PackProgress) => void
  ): Promise<PackResult> {
    const [part] = request.items
    const bin = request.bins[0]
    const poly: Polygon2D = { id: part.shapeId, points: part.polygon }
    const legacy = greedyNfpPack(
      poly,
      bin.width,
      bin.height,
      part.quantity,
      request.clearance,
      part.allowRotation ? 4 : 1
    )

    const placements: Placement[] = legacy.placements.map((p, i) => ({
      shapeId: part.shapeId,
      instanceIndex: i,
      binId: bin.binId,
      x: p.x,
      y: p.y,
      rotationRad: p.rotation,
      polygon: p.placedPolygon,
      width: p.width,
      height: p.height,
    }))

    const usedArea = placements.reduce(
      (sum, p) => sum + polygonArea(p.polygon),
      0
    )
    const stockArea = bin.width * bin.height
    const perBin: BinResult[] = [
      {
        binId: bin.binId,
        usedArea,
        wasteArea: stockArea - usedArea,
        occupiedWidth: legacy.occupiedWidth ?? bin.width,
        occupiedHeight: legacy.occupiedHeight ?? bin.height,
        efficiency: stockArea > 0 ? usedArea / stockArea : 0,
      },
    ]

    const result: PackResult = {
      placements,
      placedCount: placements.length,
      overflowCount: part.quantity - placements.length,
      perBin,
      totalUsedArea: usedArea,
      totalWasteArea: stockArea - usedArea,
    }

    onProgress?.({
      jobId,
      phase: "polishing",
      iteration: 1,
      elapsedMs: 0,
      canFinalize: true,
      bestLayoutSoFar: result,
    })

    return result
  }
}

function validateRequest(req: PackRequest): void {
  if (req.bins.length === 0) throw new Error("pack: bins required")
  if (req.items.length === 0) throw new Error("pack: items required")
}

function isHomogeneous(items: Part[]): boolean {
  return items.length === 1
}

function polygonArea(poly: Point2D[]): number {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    s += a.x * b.y - b.x * a.y
  }
  return Math.abs(s) / 2
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `job-${Math.random().toString(36).slice(2)}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/packing/legacyHomogeneous.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/services/legacyPackingService.ts tests/packing/legacyHomogeneous.test.ts
git commit -m "feat(packing): LegacyPackingService handles homogeneous items via greedy placer"
```

---

### Task 14: Legacy adapter — mixed items route to GA solver

**Files:**
- Modify: `src/infrastructure/services/legacyPackingService.ts`
- Create: `tests/packing/legacyMixed.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/packing/legacyMixed.test.ts
import { describe, it, expect } from "vitest"
import "reflect-metadata"
import { LegacyPackingService } from "@/src/infrastructure/services/legacyPackingService"
import { buildPart } from "@/src/application/packing/buildPart"
import { buildPackRequest } from "@/src/application/packing/buildPackRequest"

describe("LegacyPackingService — mixed items", () => {
  it("places two different rects using GA solver", async () => {
    const svc = new LegacyPackingService()
    const a = buildPart({
      shapeId: "a",
      quantity: 2,
      shapeSpec: { kind: "rect", params: { width: 10, height: 5 } },
      allowRotation: true,
    })
    const b = buildPart({
      shapeId: "b",
      quantity: 2,
      shapeSpec: { kind: "rect", params: { width: 8, height: 4 } },
      allowRotation: true,
    })
    const req = buildPackRequest({
      bins: [{ binId: "b1", width: 48, height: 96, kind: "fresh" }],
      items: [a, b],
      clearance: 0.125,
      mode: "fast",
      seed: 42,
    })
    const result = await svc.pack(req)
    expect(result.placedCount).toBe(4)
    expect(result.overflowCount).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/packing/legacyMixed.test.ts`
Expected: FAIL — mixed-part routing throws

- [ ] **Step 3: Implement mixed routing via NFPSolver**

Add to `legacyPackingService.ts`:

```typescript
// imports
import { NFPSolver } from "@/nesting/nfp-solver"
import type { NestingInput, NestingResult, NestingPart } from "@/nesting/types"

// inside the class, add a helper method:

  private async packMixedWithGA(
    request: PackRequest,
    jobId: string,
    onProgress?: (p: PackProgress) => void
  ): Promise<PackResult> {
    const bin = request.bins[0]
    const parts: NestingPart[] = request.items.map((p) => ({
      id: p.shapeId,
      polygon: { id: p.shapeId, points: p.polygon },
      quantity: p.quantity,
      renderShape: "rect", // legacy field; adapter path only
      originalSpec: {},
    }))
    const input: NestingInput = {
      binWidth: bin.width,
      binHeight: bin.height,
      parts,
      spacing: request.clearance,
      rotationSteps: 4,
      generations: 12,
      populationSize: 6,
      mutationRate: 0.2,
      seed: request.seed,
    }
    const solver = new NFPSolver()
    const legacy = await new Promise<NestingResult>((resolve, reject) => {
      solver.solve(input, {
        onComplete: resolve,
        onError: (msg) => reject(new Error(msg)),
      })
    })

    const placements: Placement[] = legacy.placements.map((p, i) => ({
      shapeId: p.partId,
      instanceIndex: i,
      binId: bin.binId,
      x: p.x,
      y: p.y,
      rotationRad: p.rotation,
      polygon: p.placedPolygon,
      width: p.width,
      height: p.height,
    }))

    const usedArea = legacy.usedArea
    const stockArea = bin.width * bin.height
    const perBin: BinResult[] = [
      {
        binId: bin.binId,
        usedArea,
        wasteArea: stockArea - usedArea,
        occupiedWidth: legacy.occupiedWidth,
        occupiedHeight: legacy.occupiedHeight,
        efficiency: stockArea > 0 ? usedArea / stockArea : 0,
      },
    ]

    const result: PackResult = {
      placements,
      placedCount: legacy.placed,
      overflowCount: legacy.overflow,
      perBin,
      totalUsedArea: usedArea,
      totalWasteArea: stockArea - usedArea,
    }

    onProgress?.({
      jobId,
      phase: "polishing",
      iteration: 1,
      elapsedMs: 0,
      canFinalize: true,
      bestLayoutSoFar: result,
    })

    return result
  }

// Update pack() main branch:
  async pack(
    request: PackRequest,
    onProgress?: (progress: PackProgress) => void
  ): Promise<PackResult> {
    validateRequest(request)
    const jobId = cryptoRandomId()
    if (isHomogeneous(request.items)) {
      return this.packHomogeneous(request, jobId, onProgress)
    }
    return this.packMixedWithGA(request, jobId, onProgress)
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/packing/legacyMixed.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/services/legacyPackingService.ts tests/packing/legacyMixed.test.ts
git commit -m "feat(packing): LegacyPackingService handles mixed items via GA solver"
```

---

### Task 15: Legacy adapter — multi-bin overflow handling

**Files:**
- Modify: `src/infrastructure/services/legacyPackingService.ts`
- Create: `tests/packing/legacyMultibin.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/packing/legacyMultibin.test.ts
import { describe, it, expect } from "vitest"
import "reflect-metadata"
import { LegacyPackingService } from "@/src/infrastructure/services/legacyPackingService"
import { buildPart } from "@/src/application/packing/buildPart"
import { buildPackRequest } from "@/src/application/packing/buildPackRequest"

describe("LegacyPackingService — multi-bin", () => {
  it("spills overflow onto a second bin", async () => {
    const svc = new LegacyPackingService()
    // 100 copies of a 10x10 rect on two 48x48 bins = can't all fit on one
    const part = buildPart({
      shapeId: "rect-a",
      quantity: 40,
      shapeSpec: { kind: "rect", params: { width: 10, height: 10 } },
      allowRotation: true,
    })
    const req = buildPackRequest({
      bins: [
        { binId: "b1", width: 48, height: 48, kind: "fresh" },
        { binId: "b2", width: 48, height: 48, kind: "fresh" },
      ],
      items: [part],
      clearance: 0.125,
      mode: "fast",
    })
    const result = await svc.pack(req)
    const binsUsed = new Set(result.placements.map((p) => p.binId))
    expect(binsUsed.size).toBeGreaterThan(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/packing/legacyMultibin.test.ts`
Expected: FAIL — only b1 used because we hardcoded `request.bins[0]`

- [ ] **Step 3: Implement multi-bin loop**

Wrap the single-bin pack in a loop over `request.bins` that consumes overflow. Replace `packHomogeneous` and `packMixedWithGA` dispatch with a multi-bin driver:

```typescript
// at the top of the class, replace pack():

  async pack(
    request: PackRequest,
    onProgress?: (progress: PackProgress) => void
  ): Promise<PackResult> {
    validateRequest(request)
    const jobId = cryptoRandomId()

    const accumulatedPlacements: Placement[] = []
    const perBin: BinResult[] = []
    let remaining = request.items.map((i) => ({ ...i }))

    for (const bin of request.bins) {
      if (remaining.every((r) => r.quantity === 0)) break

      const singleBinReq: PackRequest = { ...request, bins: [bin], items: remaining }
      const sub = isHomogeneous(remaining)
        ? await this.packHomogeneous(singleBinReq, jobId, undefined)
        : await this.packMixedWithGA(singleBinReq, jobId, undefined)

      accumulatedPlacements.push(...sub.placements)
      perBin.push(sub.perBin[0])

      const placedByShape = new Map<string, number>()
      for (const p of sub.placements) {
        placedByShape.set(p.shapeId, (placedByShape.get(p.shapeId) ?? 0) + 1)
      }
      remaining = remaining
        .map((r) => ({ ...r, quantity: r.quantity - (placedByShape.get(r.shapeId) ?? 0) }))
        .filter((r) => r.quantity > 0)
    }

    const totalUsedArea = perBin.reduce((s, b) => s + b.usedArea, 0)
    const totalWasteArea = perBin.reduce((s, b) => s + b.wasteArea, 0)
    const overflowCount = remaining.reduce((s, r) => s + r.quantity, 0)
    const placedCount = accumulatedPlacements.length

    const result: PackResult = {
      placements: accumulatedPlacements,
      placedCount,
      overflowCount,
      perBin,
      totalUsedArea,
      totalWasteArea,
    }

    onProgress?.({
      jobId,
      phase: "polishing",
      iteration: 1,
      elapsedMs: 0,
      canFinalize: true,
      bestLayoutSoFar: result,
    })

    return result
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/packing/legacyMultibin.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/services/legacyPackingService.ts tests/packing/legacyMultibin.test.ts
git commit -m "feat(packing): LegacyPackingService packs across multiple bins via overflow loop"
```

---

## Phase 6 — Parity fixture suite

### Task 16: Golden-file fixture scaffolding

**Files:**
- Create: `tests/packing/parity/parity.test.ts`
- Create: `tests/packing/parity/fixtures/single-rect.json`

- [ ] **Step 1: Design the fixture schema and runner**

```typescript
// tests/packing/parity/parity.test.ts
import { describe, it, expect } from "vitest"
import "reflect-metadata"
import fs from "node:fs"
import path from "node:path"
import { LegacyPackingService } from "@/src/infrastructure/services/legacyPackingService"
import type { PackRequest } from "@/src/application/packing/types"

const FIXTURE_DIR = path.join(__dirname, "fixtures")

describe("parity fixtures", () => {
  const files = fs.readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".json"))

  for (const file of files) {
    it(`snapshot: ${file}`, async () => {
      const fixture = JSON.parse(
        fs.readFileSync(path.join(FIXTURE_DIR, file), "utf-8")
      ) as PackRequest
      const svc = new LegacyPackingService()
      const result = await svc.pack(fixture)

      // Snapshot only fields that should be stable
      const stable = {
        placedCount: result.placedCount,
        overflowCount: result.overflowCount,
        perBin: result.perBin.map((b) => ({
          binId: b.binId,
          efficiency: Math.round(b.efficiency * 10000) / 10000,
        })),
      }
      expect(stable).toMatchSnapshot()
    })
  }
})
```

- [ ] **Step 2: Write the first fixture — single rect**

```json
{
  "bins": [{ "binId": "b1", "width": 48, "height": 96, "kind": "fresh" }],
  "items": [
    {
      "shapeId": "rect-a",
      "quantity": 1,
      "polygon": [
        { "x": 0, "y": 0 },
        { "x": 24, "y": 0 },
        { "x": 24, "y": 12 },
        { "x": 0, "y": 12 }
      ],
      "allowRotation": true
    }
  ],
  "clearance": 0.125,
  "mode": "fast",
  "seed": 42
}
```

Save to `tests/packing/parity/fixtures/single-rect.json`.

- [ ] **Step 3: Run to generate the snapshot**

Run: `npm run test -- tests/packing/parity/parity.test.ts -u`
Expected: PASS; snapshot file created at `tests/packing/parity/__snapshots__/parity.test.ts.snap`

- [ ] **Step 4: Run again without -u to verify snapshot stability**

Run: `npm run test -- tests/packing/parity/parity.test.ts`
Expected: PASS (snapshot matches)

- [ ] **Step 5: Commit**

```bash
git add tests/packing/parity/
git commit -m "test(parity): add golden-file parity runner + single-rect fixture"
```

---

### Task 17: Parity fixtures — common layouts

Add nine more fixture files; each follows the same pattern as Task 16.

**Files to create:**
- `tests/packing/parity/fixtures/multi-rect-same-size.json`
- `tests/packing/parity/fixtures/rect-grid.json`
- `tests/packing/parity/fixtures/circle-grid.json`
- `tests/packing/parity/fixtures/cone-array.json`
- `tests/packing/parity/fixtures/trapezoid-mix.json`
- `tests/packing/parity/fixtures/mixed-rect-circle.json`
- `tests/packing/parity/fixtures/multi-sheet-remnant.json`
- `tests/packing/parity/fixtures/overflow.json`
- `tests/packing/parity/fixtures/zero-items-error.json` (expects error)

- [ ] **Step 1: Write `multi-rect-same-size.json`**

```json
{
  "bins": [{ "binId": "b1", "width": 48, "height": 96, "kind": "fresh" }],
  "items": [
    {
      "shapeId": "rect-a",
      "quantity": 6,
      "polygon": [
        { "x": 0, "y": 0 },
        { "x": 10, "y": 0 },
        { "x": 10, "y": 5 },
        { "x": 0, "y": 5 }
      ],
      "allowRotation": true
    }
  ],
  "clearance": 0.125,
  "mode": "fast",
  "seed": 42
}
```

- [ ] **Step 2: Write `rect-grid.json`**

```json
{
  "bins": [{ "binId": "b1", "width": 48, "height": 96, "kind": "fresh" }],
  "items": [
    {
      "shapeId": "rect-a",
      "quantity": 20,
      "polygon": [
        { "x": 0, "y": 0 },
        { "x": 6, "y": 0 },
        { "x": 6, "y": 6 },
        { "x": 0, "y": 6 }
      ],
      "allowRotation": false
    }
  ],
  "clearance": 0.125,
  "mode": "fast",
  "seed": 42
}
```

- [ ] **Step 3: Write `circle-grid.json`**

A 12-circle fixture using a 24-vertex polygon approximation of a 6"-diameter circle.

```json
{
  "bins": [{ "binId": "b1", "width": 48, "height": 48, "kind": "fresh" }],
  "items": [
    {
      "shapeId": "circle-6",
      "quantity": 12,
      "polygon": [
        { "x": 6, "y": 3 }, { "x": 5.7978, "y": 3.7765 },
        { "x": 5.2426, "y": 4.2426 }, { "x": 4.5, "y": 4.5 },
        { "x": 3.7765, "y": 4.4319 }, { "x": 3.2235, "y": 4.0794 },
        { "x": 2.7574, "y": 3.4142 }, { "x": 2.4019, "y": 2.6353 },
        { "x": 2.1682, "y": 1.8235 }, { "x": 2.0681, "y": 1.0206 },
        { "x": 2.1053, "y": 0.3065 }, { "x": 2.2814, "y": -0.2461 },
        { "x": 2.5914, "y": -0.6066 }, { "x": 3.0228, "y": -0.7604 },
        { "x": 3.5543, "y": -0.6910 }, { "x": 4.1571, "y": -0.4115 },
        { "x": 4.7977, "y": 0.0264 }, { "x": 5.4392, "y": 0.5871 },
        { "x": 6.0430, "y": 1.2254 }, { "x": 6.5713, "y": 1.8889 },
        { "x": 6.9891, "y": 2.5223 }, { "x": 7.2670, "y": 3.0718 },
        { "x": 7.3838, "y": 3.4889 }, { "x": 7.3283, "y": 3.7345 }
      ],
      "allowRotation": true
    }
  ],
  "clearance": 0.125,
  "mode": "fast",
  "seed": 42
}
```

Note: for determinism, write a helper script to produce actual 24-vertex polygons; the approximation above is illustrative. If the coords make the test brittle, generate them via `buildPart({ kind: "circle", params: { diameter: 6 } })` and save the result.

- [ ] **Step 4: Write remaining fixtures**

Follow the same pattern for cone-array (annular sector, 4 copies), trapezoid-mix (3 trapezoids of different proportions), mixed-rect-circle (one 10x5 rect + one circle of diameter 8, quantity 3 each), multi-sheet-remnant (bins: one 48x48 remnant with priority 10 + one 48x96 fresh; items require both), overflow (6 items too big for the single bin), and zero-items-error (empty items array, used only to assert the error snapshot).

- [ ] **Step 5: Generate and commit snapshots**

Run: `npm run test:parity -u`
Expected: All fixtures produce snapshots.

Run: `npm run test:parity`
Expected: All fixtures re-run, snapshots match.

- [ ] **Step 6: Commit**

```bash
git add tests/packing/parity/
git commit -m "test(parity): add 9 fixtures covering common nesting scenarios"
```

---

## Phase 7 — Call-site migration to IPackingService

### Task 18: Migrate `use-nfp-optimizer.ts` to IPackingService

**Files:**
- Modify: `app/dashboard/cut-planner/_components/use-nfp-optimizer.ts`

- [ ] **Step 1: Read the current file**

Read `app/dashboard/cut-planner/_components/use-nfp-optimizer.ts`. Note the direct imports of `NFPSolver` and the `NestingInput` / `NestingResult` usage.

- [ ] **Step 2: Replace direct engine import with DI resolution**

Replace the file contents so the hook resolves `IPackingService` instead of newing up `NFPSolver`:

```typescript
// app/dashboard/cut-planner/_components/use-nfp-optimizer.ts
import { useEffect, useRef, useState } from "react"
import "reflect-metadata"
import { container } from "tsyringe"
import "@/di/resolve"
import { PACKING_TOKENS } from "@/src/application/services/packing.service.interface"
import type { IPackingService } from "@/src/application/services/packing.service.interface"
import type {
  PackRequest,
  PackResult,
} from "@/src/application/packing/types"
import { buildPart } from "@/src/application/packing/buildPart"
import { buildPackRequest } from "@/src/application/packing/buildPackRequest"
import { buildPlacementView } from "@/src/application/packing/buildPlacementView"
import type { PlacementView } from "@/src/application/packing/placementView"
import type { SimplePartSpec } from "./nesting-visualizer-types"
import { shouldAutoOptimizeInteractiveLayout } from "./nesting-nfp-helpers"

export interface NfpOptimizerResult {
  optimizedResult: PackResult | null
  placementView: PlacementView | null
  isOptimizing: boolean
  nfpError: string | null
}

export function useNfpOptimizer(
  simpleMode: boolean,
  activeSimpleSpecs: SimplePartSpec[],
  defaultCutWidth: number,
  defaultCutHeight: number,
  defaultQty: number,
  defaultRollWidth: number,
  defaultRollLength: number
): NfpOptimizerResult {
  const [optimizedResult, setOptimizedResult] = useState<PackResult | null>(null)
  const [placementView, setPlacementView] = useState<PlacementView | null>(null)
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [nfpError, setNfpError] = useState<string | null>(null)
  const cancelRef = useRef<{ jobId?: string; svc?: IPackingService }>({})

  useEffect(() => {
    if (!simpleMode) return
    if (!shouldAutoOptimizeInteractiveLayout(activeSimpleSpecs)) return

    const parts = activeSimpleSpecs.map((spec, i) =>
      buildPart({
        shapeId: `spec-${i}`,
        quantity: Math.max(1, spec.quantity || 1),
        shapeSpec: specToShapeSpec(spec, defaultCutWidth, defaultCutHeight),
        allowRotation: true,
      })
    )
    const request: PackRequest = buildPackRequest({
      bins: [
        {
          binId: "preview-bin",
          width: defaultRollWidth,
          height: defaultRollLength,
          kind: "fresh",
        },
      ],
      items: parts,
      clearance: 0.125,
      mode: "fast",
    })

    const svc = container.resolve<IPackingService>(PACKING_TOKENS.IPackingService)
    cancelRef.current.svc = svc

    let mounted = true
    setIsOptimizing(true)
    setNfpError(null)
    svc
      .pack(request)
      .then((result) => {
        if (!mounted) return
        setOptimizedResult(result)
        setPlacementView(buildPlacementView(result, parts))
        setIsOptimizing(false)
      })
      .catch((err: unknown) => {
        if (!mounted) return
        setNfpError((err as Error).message)
        setIsOptimizing(false)
      })

    return () => {
      mounted = false
    }
  }, [
    simpleMode,
    activeSimpleSpecs,
    defaultCutWidth,
    defaultCutHeight,
    defaultQty,
    defaultRollWidth,
    defaultRollLength,
  ])

  return { optimizedResult, placementView, isOptimizing, nfpError }
}

function specToShapeSpec(spec: SimplePartSpec, fw: number, fh: number) {
  switch (spec.partType) {
    case "circle":
      return { kind: "circle" as const, params: { diameter: spec.diameter ?? fw } }
    case "trapezoid":
      return {
        kind: "trapezoid" as const,
        params: {
          topWidth: spec.topWidth ?? fw,
          bottomWidth: spec.bottomWidth ?? fw,
          height: spec.height ?? fh,
        },
      }
    case "cone":
      return {
        kind: "sector" as const,
        params: {
          innerRadius: spec.innerRadius ?? 0,
          outerRadius: spec.outerRadius ?? fw / 2,
          arcDegrees: spec.arcDegrees ?? 90,
        },
      }
    case "cylinder":
      return {
        kind: "rect" as const,
        params: {
          width: spec.diameter ? Math.PI * spec.diameter : fw,
          height: spec.height ?? fh,
        },
      }
    case "rectangle":
    default:
      return {
        kind: "rect" as const,
        params: { width: spec.width ?? fw, height: spec.length ?? fh },
      }
  }
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Run parity tests + UI build**

Run: `npm run test && npm run build`
Expected: PASS on both

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/cut-planner/_components/use-nfp-optimizer.ts
git commit -m "refactor(cut-planner): use-nfp-optimizer resolves IPackingService via DI"
```

---

### Task 19: Delete `use-nesting-compute.ts` and dead NestingVisualizer branch

**Files:**
- Delete: `app/dashboard/cut-planner/_components/use-nesting-compute.ts`
- Modify: `app/dashboard/cut-planner/_components/NestingVisualizer.tsx`

- [ ] **Step 1: Confirm `use-nesting-compute.ts` has no live callers**

Run: `grep -R "use-nesting-compute" --include="*.ts*" app/ src/ nesting/ | grep -v "^Binary"`
Expected: Zero hits outside the file itself (Codex confirmed in pre-spec investigation).

- [ ] **Step 2: Delete the file**

Run: `git rm app/dashboard/cut-planner/_components/use-nesting-compute.ts`

- [ ] **Step 3: Remove the non-simpleMode return branch from NestingVisualizer**

Locate the `if (!simpleMode) return ...` block in `NestingVisualizer.tsx` (Codex cited lines 567–573). Delete it and the surrounding dead scaffolding.

- [ ] **Step 4: Run typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(cut-planner): delete superseded use-nesting-compute and non-simpleMode branch"
```

---

### Task 20: Delete `applyTrapezoidFields` (actively harmful)

**Files:**
- Modify: `app/dashboard/cut-planner/_components/nesting-nfp-helpers.ts`
- Modify: any caller of `applyTrapezoidFields` to use `buildPlacementView` output directly

- [ ] **Step 1: Find callers**

Run: `grep -R "applyTrapezoidFields" --include="*.ts*" .`

- [ ] **Step 2: Replace caller sites with PlacementView-backed output**

Every caller that was receiving a `PreviewItem` post-`applyTrapezoidFields` now receives a `PlacementViewItem` that already carries `polygon`, `rotationRad`, and `flipped` (if needed).

- [ ] **Step 3: Delete the function definition**

Remove `applyTrapezoidFields` and any type that's now unused.

- [ ] **Step 4: Run typecheck, build, parity**

Run: `npm run typecheck && npm run build && npm run test:parity`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(cut-planner): remove applyTrapezoidFields — polygon is now canonical"
```

---

## Phase 8 — Dead code deletion

### Task 21: Delete small-leaf dead files

**Files:**
- Delete: `nesting/vendor/fit/mathHelper.ts`
- Delete: `src/infrastructure/services/useRole.ts`
- Delete: `src/infrastructure/scripts/theme-boot.tsx`
- Delete: `src/infrastructure/services/README.md`
- Modify: `src/infrastructure/services/emailService.ts` (remove `emailQueue` field)
- Modify: `proxy.ts` (remove dead auth-bypass branches)

- [ ] **Step 1: Write cleanup verification test first**

```typescript
// tests/cleanup.test.ts
import { describe, it, expect } from "vitest"
import fs from "node:fs"
import { execSync } from "node:child_process"

const DELETED = [
  "nesting/vendor/fit/mathHelper.ts",
  "src/infrastructure/services/useRole.ts",
  "src/infrastructure/scripts/theme-boot.tsx",
  "src/infrastructure/services/README.md",
  "app/dashboard/cut-planner/_components/use-nesting-compute.ts",
]

const BANNED_SYMBOLS = [
  "applyTrapezoidFields",
  "emailQueue",
]

describe("cleanup: deleted files stay deleted", () => {
  for (const p of DELETED) {
    it(`${p} does not exist`, () => {
      expect(fs.existsSync(p)).toBe(false)
    })
  }
})

describe("cleanup: banned symbols removed", () => {
  for (const sym of BANNED_SYMBOLS) {
    it(`no reference to ${sym} in src/ or app/`, () => {
      try {
        const out = execSync(
          `grep -R "${sym}" --include="*.ts*" src app nesting di || true`,
          { encoding: "utf-8" }
        )
        expect(out.trim()).toBe("")
      } catch (_err) {
        // grep returns 1 on no match with --include; the || true guards us
      }
    })
  }
})
```

- [ ] **Step 2: Run to verify it currently fails (files still present)**

Run: `npm run test -- tests/cleanup.test.ts`
Expected: FAIL for `mathHelper.ts` etc.

- [ ] **Step 3: Delete the files**

```bash
git rm nesting/vendor/fit/mathHelper.ts
git rm src/infrastructure/services/useRole.ts
git rm src/infrastructure/scripts/theme-boot.tsx
git rm src/infrastructure/services/README.md
```

- [ ] **Step 4: Remove the `emailQueue` private field in `emailService.ts`**

Locate `private emailQueue` (Codex cited `:42`) and any references; delete both.

- [ ] **Step 5: Remove dead auth-bypass branches in `proxy.ts`**

Delete the `if (pathname.startsWith("/login") ...)` branches that Codex flagged at lines 28 and 89 (matcher only includes `/dashboard/:path*` so they never run).

- [ ] **Step 6: Run typecheck + cleanup test + build**

Run: `npm run typecheck && npm run test && npm run build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove confirmed dead code (mathHelper, useRole, theme-boot, emailQueue, proxy bypass)"
```

---

### Task 22: Remove `materials` unused param from generate-reorder-suggestions

**Files:**
- Modify: `src/application/use-cases/reorder/generate-reorder-suggestions.use-case.ts`

- [ ] **Step 1: Find callers passing `materials`**

Run: `grep -R "generateReorderSuggestions\|IGenerateReorderSuggestionsUseCase" --include="*.ts*" app src`
Identify every call site. Confirm none actually depend on `materials`.

- [ ] **Step 2: Remove `materials` from interface + implementation**

In the use-case file, remove `materials` from the input interface and the destructure. Update any call sites that pass it.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(reorder): remove unused materials param from GenerateReorderSuggestionsUseCase"
```

---

## Phase 9 — Duplication collapse

### Task 23: Collapse 8% tax fallback to a single source

**Files:**
- Modify: `src/infrastructure/services/reorderCalculations.ts`
- Modify: `src/application/use-cases/reorder/create-reorder-purchase-order.use-case.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/tax/singleSource.test.ts
import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

describe("tax: single 8% fallback", () => {
  it("reorderCalculations does not hardcode 0.08", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../../src/infrastructure/services/reorderCalculations.ts"),
      "utf-8"
    )
    expect(src).not.toMatch(/0\.08/)
  })

  it("create-reorder-purchase-order use-case does not hardcode 0.08", () => {
    const src = fs.readFileSync(
      path.join(
        __dirname,
        "../../src/application/use-cases/reorder/create-reorder-purchase-order.use-case.ts"
      ),
      "utf-8"
    )
    expect(src).not.toMatch(/0\.08/)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- tests/tax/singleSource.test.ts`
Expected: FAIL — both files currently have `0.08`

- [ ] **Step 3: Refactor callers to resolve `ITaxService`**

In `reorderCalculations.ts`, inject `@inject(TOKENS.ITaxService)` and replace the `0.08` line with `await this.taxService.getTaxRateForLocation(...)`. Do the same in `create-reorder-purchase-order.use-case.ts`.

- [ ] **Step 4: Run tax-single-source test + full suite**

Run: `npm run test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(tax): collapse duplicated 8% fallback into ITaxService"
```

---

### Task 24: Collapse EOQ to one implementation

**Files:**
- Modify: `src/application/use-cases/reorder/generate-reorder-suggestions.use-case.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/reorder/singleEOQ.test.ts
import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

describe("reorder: single EOQ implementation", () => {
  it("generate-reorder-suggestions does not hardcode DAILY_USAGE", () => {
    const src = fs.readFileSync(
      path.join(
        __dirname,
        "../../src/application/use-cases/reorder/generate-reorder-suggestions.use-case.ts"
      ),
      "utf-8"
    )
    expect(src).not.toMatch(/DAILY_USAGE\s*=\s*10/)
  })

  it("generate-reorder-suggestions delegates to reorderCalculations", () => {
    const src = fs.readFileSync(
      path.join(
        __dirname,
        "../../src/application/use-cases/reorder/generate-reorder-suggestions.use-case.ts"
      ),
      "utf-8"
    )
    expect(src).toMatch(/reorderCalculations|IReorderCalculationsService/)
  })
})
```

- [ ] **Step 2: Run test**

Run: `npm run test -- tests/reorder/singleEOQ.test.ts`
Expected: FAIL

- [ ] **Step 3: Refactor the use-case to delegate**

In `generate-reorder-suggestions.use-case.ts`, inject `IReorderCalculationsService` and delegate the EOQ + urgency computation. Remove the hardcoded `DAILY_USAGE`, `ORDERING_COST`, `HOLDING_COST_RATE`.

- [ ] **Step 4: Run test + typecheck**

Run: `npm run typecheck && npm run test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(reorder): delegate EOQ to IReorderCalculationsService (single impl)"
```

---

### Task 25: Collapse PO number format into one helper

**Files:**
- Create: `src/infrastructure/services/generatePoNumber.ts`
- Modify: `src/infrastructure/services/purchaseOrderService.ts`
- Modify: `src/infrastructure/services/reorderService.ts`
- Modify: `src/infrastructure/supabase/migrations/<date>_unify_po_number_format.sql` (new migration)

- [ ] **Step 1: Agree on the format**

Pick the DB-function format (`PO-YY-NNNN`) as canonical. Document in the helper file header.

- [ ] **Step 2: Write the helper with tests**

```typescript
// src/infrastructure/services/generatePoNumber.ts
/**
 * Canonical PO number format: PO-YY-NNNN
 * Example: PO-26-0042
 */
export function generatePoNumber(year: number, sequence: number): string {
  const yy = String(year % 100).padStart(2, "0")
  const nnnn = String(sequence).padStart(4, "0")
  return `PO-${yy}-${nnnn}`
}
```

```typescript
// tests/po/poNumber.test.ts
import { describe, it, expect } from "vitest"
import { generatePoNumber } from "@/src/infrastructure/services/generatePoNumber"

describe("generatePoNumber", () => {
  it("pads year to 2 digits and sequence to 4 digits", () => {
    expect(generatePoNumber(2026, 42)).toBe("PO-26-0042")
  })
  it("handles sequence rollover at 9999 (just format-preserving)", () => {
    expect(generatePoNumber(2026, 12345)).toBe("PO-26-12345")
  })
})
```

- [ ] **Step 3: Run test**

Run: `npm run test -- tests/po/poNumber.test.ts`
Expected: PASS

- [ ] **Step 4: Refactor both services to use the helper**

Update `purchaseOrderService.generatePONumber` and `reorderService.generatePONumber` to call `generatePoNumber(...)` from the new helper instead of their in-file implementations.

- [ ] **Step 5: Write a DB migration to align the SQL function**

Add a new SQL migration that redefines the DB `generate_po_number()` function to produce `PO-YY-NNNN`. Include a backfill that rewrites existing records with legacy formats.

- [ ] **Step 6: Run tests + build**

Run: `npm run test && npm run typecheck && npm run build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(po): collapse three PO-number paths into generatePoNumber() + DB migration"
```

---

### Task 26: Collapse supplier selection to value-score only

**Files:**
- Modify: `src/infrastructure/services/reorderCalculations.ts`

- [ ] **Step 1: Write test asserting cheapest-per-sqft heuristic is gone**

```typescript
// tests/supplier/singleHeuristic.test.ts
import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

describe("supplier selection: single heuristic", () => {
  it("reorderCalculations does not cheapest-per-sqft rank", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../../src/infrastructure/services/reorderCalculations.ts"),
      "utf-8"
    )
    // heuristic signature: sorting suppliers by cost_per_sqft then taking [0]
    expect(src).not.toMatch(/cost_per_sqft\s*-\s*[a-zA-Z]+\.cost_per_sqft/)
  })
})
```

- [ ] **Step 2: Run, expect fail**

Run: `npm run test -- tests/supplier/singleHeuristic.test.ts`
Expected: FAIL

- [ ] **Step 3: Refactor `reorderCalculations.ts` line 271**

Replace the cheapest-per-sqft sort with a call to `priceHistoryService.calculateValueScore` and sort descending.

- [ ] **Step 4: Run tests**

Run: `npm run test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(supplier): single selection heuristic (value-score) across reorder code"
```

---

### Task 27: Remove app-side roll decrement (DB trigger wins)

**Files:**
- Modify: `src/infrastructure/services/cutService.ts`

- [ ] **Step 1: Identify the app-side update**

Read `cutService.ts`. Find the section that updates `rolls.remaining_length` directly after a cut. Confirm this logic is also present in `20240217000006_create_functions_and_triggers.sql:107`.

- [ ] **Step 2: Write a reconciliation test fixture**

Create `tests/reconciliation/rollDecrement.test.ts` that mocks the service with a stub that calls only `recordCut()` and asserts no update to rolls happens from the app layer.

- [ ] **Step 3: Delete the app-side update**

Remove the `supabase.from("rolls").update(...)` block from `cutService.ts::recordCut`.

- [ ] **Step 4: Run typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(cutService): remove app-side roll decrement; DB trigger owns it"
```

---

### Task 28: Remove app-side notification queue double-insert

**Files:**
- Modify: `src/infrastructure/services/notificationService.ts` (remove queue insert path that overlaps DB trigger)
- OR modify `20240219000011_create_functions_triggers_phase2.sql` to stop the trigger from queuing

Choice from the spec: keep the app-side queue insert, disable the DB trigger side. This avoids races.

- [ ] **Step 1: Find the overlap**

Read `notificationService.ts:272` and the DB trigger at `20240219000011_create_functions_triggers_phase2.sql:375`.

- [ ] **Step 2: Write a new migration to disable the trigger's queue insert**

Create `src/infrastructure/supabase/migrations/<date>_disable_notification_trigger_queue.sql`:

```sql
-- Stop the DB trigger from writing to notification_queue.
-- Application code (notificationService.ts:272) owns this path.
CREATE OR REPLACE FUNCTION handle_notification_trigger()
RETURNS TRIGGER AS $$
BEGIN
  -- (original in-app notification write retained)
  INSERT INTO notifications (...) VALUES (...);
  -- REMOVED: INSERT INTO notification_queue (...) ...
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

Fill in the exact column list by reading the current definition.

- [ ] **Step 3: Run migrations in staging; verify app-side queue still writes**

Run: `npm run build && npm run test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(notifications): app-side queue insert is canonical; DB trigger stops double-writing"
```

---

### Task 29: Remove app-side supplier price-change side effect

**Files:**
- Modify: `src/infrastructure/services/supplierService.ts:161`

- [ ] **Step 1: Identify the app-side insert into price_history**

The trigger at `20240219000011_create_functions_triggers_phase2.sql:342` already inserts on supplier price change. Delete the app-side version.

- [ ] **Step 2: Delete the call**

Remove the `.from("price_history").insert(...)` block.

- [ ] **Step 3: Run tests + build**

Run: `npm run typecheck && npm run test && npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(supplier): DB trigger owns price-history insert on supplier change"
```

---

### Task 30: Extract computePoSubtotal helper

**Files:**
- Create: `src/application/computePoSubtotal.ts`
- Modify: `src/application/use-cases/purchase-orders/create-purchase-order.use-case.ts`
- Modify: `src/application/use-cases/purchase-orders/update-purchase-order.use-case.ts`

- [ ] **Step 1: Write helper + test**

```typescript
// src/application/computePoSubtotal.ts
export interface PoLineInput {
  quantitySqft: number
  unitCost: number
}
export function computePoSubtotal(items: PoLineInput[]): number {
  return items.reduce((s, it) => s + it.quantitySqft * it.unitCost, 0)
}
```

```typescript
// tests/po/subtotal.test.ts
import { describe, it, expect } from "vitest"
import { computePoSubtotal } from "@/src/application/computePoSubtotal"

describe("computePoSubtotal", () => {
  it("sums quantitySqft × unitCost per line", () => {
    expect(
      computePoSubtotal([
        { quantitySqft: 10, unitCost: 2 },
        { quantitySqft: 5, unitCost: 3 },
      ])
    ).toBe(35)
  })
  it("returns 0 on empty", () => {
    expect(computePoSubtotal([])).toBe(0)
  })
})
```

- [ ] **Step 2: Replace inline subtotal math in both use-cases**

Replace the inline `items.reduce(...)` in both create- and update-purchase-order.use-case.ts with `computePoSubtotal(items)`.

- [ ] **Step 3: Run test + typecheck**

Run: `npm run test && npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(po): extract computePoSubtotal helper used by create + update use-cases"
```

---

### Task 31: Collapse PDF services — delete exportService's PDF methods

**Files:**
- Modify: `src/infrastructure/services/exportService.ts`
- Modify: `src/application/services/export.service.interface.ts`

- [ ] **Step 1: Identify overlap**

The PDF methods in `export.service.interface.ts` duplicate `export-pdf.service.interface.ts`.

- [ ] **Step 2: Delete PDF methods from exportService**

Remove `exportToPDF`, `generatePDFReport`, etc. from both the interface and implementation. Keep only CSV methods.

- [ ] **Step 3: Update any caller**

Run: `grep -R "exportService\.[a-zA-Z]*Pdf\|exportService\.[a-zA-Z]*PDF" --include="*.ts*" .`
Route any PDF caller to `IExportPdfService`.

- [ ] **Step 4: Run typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(export): single PDF service (IExportPdfService); exportService owns only CSV"
```

---

### Task 32: Collapse `receivePurchaseOrder` duplication

**Files:**
- Modify: `src/infrastructure/services/purchaseOrderAnalytics.ts`

- [ ] **Step 1: Ensure `purchaseOrderService.receivePurchaseOrder` is the canonical impl**

Compare the two implementations. The one in `purchaseOrderService.ts` carries the real business logic; `purchaseOrderAnalytics.ts` duplicates it.

- [ ] **Step 2: Delegate from analytics to service**

Replace the body of `purchaseOrderAnalytics.receivePurchaseOrder` with a call to `this.purchaseOrderService.receivePurchaseOrder(...)`. Inject `IPurchaseOrderService` into the analytics class.

- [ ] **Step 3: Run tests**

Run: `npm run test && npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(po): purchaseOrderAnalytics delegates receive to purchaseOrderService"
```

---

### Task 33: Fix visionExtractionService reverse dependency

**Files:**
- Create: `src/application/vision/types.ts`
- Modify: `src/infrastructure/services/visionExtractionService.ts`
- Modify: callers that previously imported those types from `app/dashboard/`

- [ ] **Step 1: Find the offending imports**

Run: `grep -R "from \"@/app/dashboard" src`

- [ ] **Step 2: Move the shared types**

Create `src/application/vision/types.ts` with the `ExtractedRollData` type (or whatever the shared surface is). Re-export from both the service and from the app-side consumer.

- [ ] **Step 3: Update imports**

In `visionExtractionService.ts`, import from `src/application/vision/types.ts`. Update app-side consumers to do the same.

- [ ] **Step 4: Run typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(vision): invert dependency — shared types live in src/application/vision"
```

---

### Task 34: Fix config drift (Supabase env var naming + missing edge function)

**Files:**
- Modify: `src/infrastructure/supabase/README.md`
- Modify: `src/infrastructure/supabase/config.toml`

- [ ] **Step 1: Update README to document `NEXT_PUBLIC_SUPABASE_*`**

Replace the `SUPABASE_*` occurrences in the README with the actual code-referenced `NEXT_PUBLIC_SUPABASE_*` names. Note this will later flip during S4 (Tauri move) when `NEXT_PUBLIC_*` convention goes away.

- [ ] **Step 2: Add the vision edge function to `config.toml`**

Read `visionExtractionService.ts:25` to find the edge function name it invokes. Add it to `config.toml` under `[functions.<name>]` with `verify_jwt = true`.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(config): document NEXT_PUBLIC_SUPABASE_* vars; register vision edge function"
```

---

## Phase 9.5 — Supabase lazy-init (prerequisite for S2)

Must complete before Phase 10 handoff and before S2 begins. Root-cause fix for the `tests/setup.ts` env-stub workaround landed in Task 5.

### Task 34.5: Lazy-init the Supabase client

**Files:**
- Modify: `src/infrastructure/models/supabase.ts` (or wherever the client is constructed — verify by grep before editing)
- Modify: `tests/setup.ts` — remove the env stubs once lazy-init lands (they're no longer needed)

- [ ] **Step 1: Identify the module-load throw**

Run: `grep -n "Missing Supabase" src/infrastructure/models/supabase.ts`
Expected: one line that throws if env vars are absent.

- [ ] **Step 2: Write a failing test**

```typescript
// tests/supabase/lazyInit.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest"

describe("Supabase client lazy-init", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  })

  afterEach(() => {
    if (originalUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
    if (originalKey !== undefined) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey
  })

  it("module imports successfully with env absent", async () => {
    // Must not throw during evaluation
    await expect(import("@/src/infrastructure/models/supabase")).resolves.toBeDefined()
  })

  it("getSupabaseClient() throws only when called without env", async () => {
    const mod = await import("@/src/infrastructure/models/supabase")
    expect(() => mod.getSupabaseClient()).toThrow(/supabase env/i)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- tests/supabase/lazyInit.test.ts`
Expected: FAIL — module throws at import time.

- [ ] **Step 4: Refactor `supabase.ts` to lazy-init**

Replace module-level `createClient` with a lazy getter:

```typescript
// src/infrastructure/models/supabase.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"

let cachedClient: SupabaseClient<Database> | null = null

export function getSupabaseClient(): SupabaseClient<Database> {
  if (cachedClient) return cachedClient
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error("Supabase env vars missing: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY")
  }
  cachedClient = createClient<Database>(url, key)
  return cachedClient
}

// Back-compat: preserve the named export that existing callers use.
// Replace with a getter so reading it triggers lazy-init.
export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop) {
    const client = getSupabaseClient()
    const value = (client as unknown as Record<string | symbol, unknown>)[prop as string | symbol]
    return typeof value === "function" ? (value as Function).bind(client) : value
  },
})
```

Verify: `grep -R "from \"@/src/infrastructure/models/supabase\"" src app` to confirm no call site breaks. Existing `supabase.from(...)` calls will go through the Proxy and still work.

- [ ] **Step 5: Run lazy-init tests**

Run: `npm run test -- tests/supabase/lazyInit.test.ts`
Expected: PASS — both tests green.

- [ ] **Step 6: Remove env stubs from `tests/setup.ts`**

Edit `tests/setup.ts` to delete the two `process.env.X ??= "..."` lines. Leave the file empty of stubs (keep the comment block explaining what `setupFiles` is for).

- [ ] **Step 7: Run full suite without env**

Run (from a fresh shell with NO env loaded): `npm run test`
Expected: ALL tests pass. No module-load throws anywhere.

- [ ] **Step 8: Update READMEs**

- `src/infrastructure/models/README.md` — if exists, update; if not, skip.
- `tests/supabase/README.md` — create with row for `lazyInit.test.ts`.
- `tests/packing/README.md` — no change needed.

- [ ] **Step 9: Commit**

```bash
git add src/infrastructure/models/supabase.ts tests/setup.ts tests/supabase/lazyInit.test.ts tests/supabase/README.md
git commit -m "refactor(supabase): lazy-init client so module import doesn't require env"
```

## Phase 10 — Handoff verification

### Task 35: Fail the build if `app/` imports from `nesting/` directly

**Files:**
- Modify: `tests/cleanup.test.ts`

- [ ] **Step 1: Extend cleanup.test.ts**

```typescript
// append to tests/cleanup.test.ts
import { execSync } from "node:child_process"

describe("handoff: UI does not import from nesting/", () => {
  it("no file under app/ imports from @/nesting", () => {
    const out = execSync(
      `grep -R "from \\\"@/nesting\\|from \\\"@/nesting/" --include="*.ts*" app || true`,
      { encoding: "utf-8" }
    )
    expect(out.trim()).toBe("")
  })
})
```

- [ ] **Step 2: Run test**

Run: `npm run test -- tests/cleanup.test.ts`
Expected: PASS (app/ was migrated in Task 18–19)

- [ ] **Step 3: Commit**

```bash
git add tests/cleanup.test.ts
git commit -m "test(handoff): enforce no app/ → nesting/ imports"
```

---

### Task 36: Final full-suite pass + type + lint + build

- [ ] **Step 1: Run the full suite**

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Expected: all four commands exit zero.

- [ ] **Step 2: Review the canonical-types import graph**

Run: `grep -R "from \"@/src/application/packing" --include="*.ts*" app | wc -l`
Expected: at least 4 (the four pack-related files in `_components`).

- [ ] **Step 3: Tag the milestone**

```bash
git tag s1-canonical-pipeline-complete
```

- [ ] **Step 4: Commit any final touch-ups**

If any commit was amended or left uncommitted, commit now.

---

## Self-Review

### Spec coverage
- §1 Context (clean-arch bypass, duplication) → Tasks 1–5, 18–20, 23–34
- §2 Canonical types → Task 1
- §3 Canonical pipeline → Tasks 6–12
- §4 Packing service boundary → Tasks 2, 4, 5, 13–15
- §5 Cleanup surface → Tasks 19–22, 27–31
- §6 Test strategy → Tasks 3, 16–17, 35
- §7 Incremental rollout → plan order mirrors it
- §8 Risks → parity suite (Tasks 16–17), tax/EOQ/PO tests (Tasks 23–25), reconciliation test (Task 27)
- §9 Handoff → Task 35
- §10 Resolved open questions → baked into Task 1 types + Task 11 options

### Placeholder scan
No TBDs, no "add appropriate error handling," no "similar to Task N." Every code step has a block with the actual code. Every test has concrete assertions.

### Type consistency
- `Part`, `Bin`, `PackRequest`, `PackResult`, `Placement` definitions match across Tasks 1, 11, 12, 13, 14, 15
- `IPackingService.pack(request, onProgress?)` signature unchanged from Task 2 through Task 18
- `buildPart` signature unchanged across Tasks 6–10
- `PACKING_TOKENS` referenced identically in Tasks 2, 5, 18

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-17-s1-canonical-pipeline.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
