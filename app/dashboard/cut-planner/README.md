# Cut Planner

The cut planner is the core feature of Rema Portal. It calculates optimal layouts for cutting rubber shapes from stock sheets, minimizing waste and maximizing material utilization.

## Modes

### Simple Mode (Interactive)

User selects a part type, enters dimensions, and sees a real-time preview of the layout on stock. Supports rectangles, circles, cylinders, cones, and trapezoids.

### Batch Mode

User queues multiple parts with different shapes/sizes. The system uses NFP (No-Fit Polygon) optimization with a genetic algorithm to find the best combined layout.

### Manual Mode

Direct input of cut dimensions against a specific roll. Used for quick one-off calculations.

## Architecture

```
User Input (part type, dimensions, quantity)
      |
      v
SimplePartSpec[] ──> simplePartToNestingParts() ──> NestingPart[]
      |                                                    |
      v                                                    v
generateSimplePartPreview()              NFPSolver.solve() (GA optimization)
      |                                                    |
      v                                                    v
SimplePartPreview                    nestingResultToPreviewItems()
      |                                                    |
      v                                                    v
NestingVisualizer <────── computeSimpleModeLayout() ───────┘
      |
      v
SVG Canvas (stock sheet + placed shapes + waste bands + cut steps)
```

## Files

### Core Components

| File                            | Purpose                                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `NestingVisualizer.tsx`         | Main orchestrator component — manages state, mode switching, delegates rendering to sub-components                |
| `nesting-viz-simple-mode.tsx`   | Simple mode SVG render — draws stock sheet, placed shapes, waste bands, dimension labels                          |
| `nesting-viz-simple-parts.tsx`  | Sub-components for simple mode (header, pattern defs, metrics, footer, cut plan, offcut labels, dimension labels) |
| `nesting-viz-simple-layout.ts`  | Pure computation for simple mode — all derived values (scale, positions, metrics, labels)                         |
| `nesting-viz-rect-panel.tsx`    | Rectangle strategy detail panel — shows scored strategies with mini-roll previews                                 |
| `nesting-viz-controls.tsx`      | Control panels — dimension inputs, shape selectors, strategy controls                                             |
| `nesting-viz-nonrect-render.ts` | Imperative SVG drawing for non-rectangular shapes (circles, cones) in background                                  |
| `PresetDimensionSelector.tsx`   | Preset template picker — standard sizes organized by shape type                                                   |
| `preset-part-type-selector.tsx` | Part type button grid (extracted from PresetDimensionSelector)                                                    |
| `preset-template-grid.tsx`      | Template grid with per-card quantity spinners (±, capped at 99)                                                   |
| `preset-selection-summary.tsx`  | Part 3 summary table — selected templates with dimensions and area                                                |

### Math & Algorithms

| File                                 | Purpose                                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `nesting-layout-utils.ts`            | Core layout math — grid calculation, strategy scoring, formatting                              |
| `nesting-packing-utils.ts`           | Bin-packing algorithms — shelf packing (with findBestShelf), guillotine cutting, centered column |
| `nesting-global-packer.ts`           | MaxRects bin class + 5 heuristics — ported from open-source repos (see attribution below)      |
| `nesting-global-packer-entry.ts`     | Multi-sheet entry point — exhaustive rotation search, sheet builder, greedy/batch/pair dispatch |
| `nesting-width-pair-packer.ts`       | Width-aware pairing pre-pass — groups similar-width items side-by-side before MaxRects         |
| `nesting-nfp-helpers.ts`             | Shape-to-polygon converters for NFP solver, result-to-preview converters                       |
| `nesting-offcut-utils.ts`            | Offcut band classification, intra-blank waste, placement bounds helpers                        |
| `nesting-preview-builders.ts`        | High-level preview builders — waste analysis, fabrication scoring, strategy comparison         |
| `nesting-shape-previews-basic.ts`    | Rectangle and circle preview generation                                                        |
| `nesting-shape-previews-advanced.ts` | Cylinder, cone, and trapezoid preview generation                                               |
| `nesting-shape-previews-dispatch.ts` | Router — dispatches to correct preview generator by part type; multi-part mixed layout         |
| `nesting-shape-previews.ts`          | Barrel re-export of all preview generators                                                     |

### SVG Rendering

| File                            | Purpose                                                                     |
| ------------------------------- | --------------------------------------------------------------------------- |
| `nesting-shape-renderer.tsx`    | Renders individual placed shapes (rect, circle, sector, trapezoid, polygon) |
| `nesting-svg-detail-step.ts`    | Draws detailed step-by-step cut visualization SVG                           |
| `nesting-svg-detail-helpers.ts` | Helper functions for SVG detail rendering (cut lines, overlays)             |
| `nesting-svg-mini-roll.ts`      | Draws miniature roll previews for strategy comparison                       |

### State & Hooks

| File                     | Purpose                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `use-nesting-compute.ts` | Main hook — manages all nesting state (dimensions, strategies, scoring, view mode) |
| `use-nfp-optimizer.ts`   | NFP optimization hook — manages solver lifecycle, results, cancellation            |
| `use-preset-state.ts`    | State management for preset selector — templates, custom sizes, per-card quantities |
| `preset-template-data.ts`| Template definitions, part type options, category badges, custom draft types        |
| `preset-utils.ts`        | Template builder helpers — custom template creation, area calculation, draft conversion |

### Types

| File                          | Purpose                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `nesting-visualizer-types.ts` | All type definitions — PreviewItem, SimplePartPreview, SimplePartSpec, strategies, etc. |

#### Key Type Definitions (`nesting-visualizer-types.ts`)

```typescript
export type SimplePartType = "rectangle" | "circle" | "cylinder" | "cone" | "trapezoid"
export type SimpleCutDirection =
  | "vertical_split"
  | "horizontal_split"
  | "radial_split"
  | "arc_bands"
  | "wrap_panels"
  | "wrap_bands"

export interface SimplePartSpec {
  partType: SimplePartType
  quantity: number
  cutDirection?: SimpleCutDirection
  cutRatios?: number[]
  width?: number
  length?: number
  diameter?: number
  height?: number
  topWidth?: number
  bottomWidth?: number
  innerRadius?: number
  outerRadius?: number
  arcDegrees?: number
}

export interface PreviewItem extends ShapePlacement {
  renderShape: SimplePreviewShape
  label: string
  cutDirection?: SimpleCutDirection
  diameter?: number
  topWidth?: number
  bottomWidth?: number
  innerRadius?: number
  outerRadius?: number
  arcDegrees?: number
  rotation?: number
  placedPolygon?: Array<{ x: number; y: number }>
}

export interface OffcutBand {
  x: number
  y: number
  width: number
  height: number
}

export type StratMethod = "rect" | "diag"
export type GrainDir = "none" | "width" | "length"

export interface Strategy {
  id: string
  name: string
  sub: string
  method: StratMethod
  cutW: number
  cutH: number
  primaryDir: "horizontal" | "vertical"
  diagType?: "corner" | "custom"
  diagAngle?: number
  ddir?: DiagDir
  steps: string[]
  icon: string
}

export interface ScoredStrategy extends Strategy {
  cols: number
  rows: number
  rects: number
  pieces: number
  waste: number
  vCuts: number
  hCuts: number
  score: number
  reasons: { p: "p" | "w" | "f"; t: string }[]
}

export type SimplePartPreview = RectLikePreview | CirclePreview

export const MIN_REUSABLE_OFFCUT_WIDTH = 11.5
export const MIN_REUSABLE_OFFCUT_HEIGHT = 12
export const MIN_REUSABLE_STRIP_WIDTH = 6
export const MIN_REUSABLE_STRIP_LENGTH = 24
```

---

## Math & Algorithms in Detail

### 1. Rectangle Layout (`nesting-layout-utils.ts`)

#### Grid Calculation (`calcLayout`)

Given a roll (W x L) and a cut piece (w x h):

```
cols = floor(W / w)
rows = floor(L / h)
capacity = cols * rows
placed = min(capacity, requested_qty)
overflow = max(0, requested_qty - capacity)
usedArea = placed * w * h
wasteArea = (W * L) - usedArea
wastePct = (wasteArea / (W * L)) * 100
```

Actual implementation:

```typescript
export function calcLayout(rollW: number, rollL: number, cw: number, ch: number) {
  const cols = Math.floor(rollW / cw)
  const rows = Math.floor(rollL / ch)
  const rects = cols * rows
  const waste = rollW * rollL > 0 ? (1 - (rects * cw * ch) / (rollW * rollL)) * 100 : 100
  return { cols, rows, rects, waste, vCuts: cols - 1, hCuts: rows - 1 }
}
```

#### Strategy Scoring (`scoreStrat`)

Each strategy gets a score 0-100 based on:

| Factor           | Weight | Logic                                               |
| ---------------- | ------ | --------------------------------------------------- |
| Waste efficiency | ~50    | `100 - wastePct * 1.2` (lower waste = higher score) |
| Grain alignment  | -45    | Penalty if cut direction conflicts with grain       |
| Feed direction   | +12    | Bonus if horizontal feed (easier for operator)      |
| Diagonal bonus   | +8     | If using diagonal cuts (2 triangles per rectangle)  |
| Quantity met     | +5     | Bonus if all requested pieces fit                   |

Six strategies are generated for every rectangle:

1. **Horizontal strips** — H-cuts first, then V-cuts
2. **Vertical strips** — V-cuts first, then H-cuts
3. **Rotated 90 deg** — Swap width/height, try both orientations
4. **Corner diagonal** — 45-degree diagonal cut
5. **Custom angle** — Diagonal at specified angle
6. **Rotated + diagonal** — Combine rotation with diagonal

Actual scoring implementation:

```typescript
export function scoreStrat(
  s: Strategy,
  rollW: number,
  rollL: number,
  qty: number,
  grain: GrainDir
): ScoredStrategy {
  const L = calcLayout(rollW, rollL, s.cutW, s.cutH)
  const pieces = s.method === "diag" ? L.rects * 2 : L.rects
  let score = 100
  const reasons: { p: "p" | "w" | "f"; t: string }[] = []

  // grain penalty
  if (grain === "width" && s.cutH > s.cutW) {
    score -= 45
    reasons.push({ p: "f", t: "Grain conflict — crosses roll width grain." })
  } else if (grain === "length" && s.cutW > s.cutH) {
    score -= 45
    reasons.push({ p: "f", t: "Grain conflict — crosses roll length grain." })
  } else if (grain !== "none") reasons.push({ p: "p", t: "Grain direction preserved." })

  // waste bonus
  score += Math.max(0, 30 - L.waste)
  // ...waste reason messages...

  // feed direction bonus
  if (s.primaryDir === "horizontal") {
    score += 12
    reasons.push({ p: "p", t: "Primary cuts run parallel to roll feed — easier." })
  }

  // diagonal bonus
  if (s.method === "diag") {
    score += 8
    reasons.push({ p: "p", t: "Diagonal yields 2× pieces per rect — both triangles kept." })
  }

  // qty penalty
  if (pieces < qty) {
    score -= 30
    reasons.push({ p: "f", t: `${pieces} pieces < ${qty} needed — second roll required.` })
  }

  return {
    ...s,
    ...L,
    pieces,
    score: Math.max(0, Math.min(100, score)),
    reasons,
  }
}
```

### 2. Shelf Packing (`nesting-packing-utils.ts`)

For mixed-shape layouts. Places items left-to-right on "shelves" (horizontal strips):

```
1. Sort items by selected criterion (area/height/width/max-edge)
2. For each item:
   a. Try to fit on existing shelf (best-fit by remaining width)
   b. If no shelf fits, create new shelf below
   c. Track remaining width per shelf
3. After placement, identify waste bands between/around items
```

**Flip patterns:** Items can be flipped in alternating patterns (none/row/checker) to nest shapes more tightly (e.g., alternating trapezoids).

Actual shelf packing implementation:

```typescript
export function packPreviewItemsOnShelves(
  items: Array<PreviewItem & { usedArea: number }>,
  rollW: number,
  rollL: number,
  sortBy: PreviewPackSort,
  flipPattern?: "none" | "checker"
): PackedPreviewItemsResult {
  const sortedItems = sortPreviewItems(items, sortBy)
  const shelves: Array<{ y: number; height: number; x: number }> = []
  const placedItems: PreviewItem[] = []
  let usedArea = 0
  let placedIndex = 0

  sortedItems.forEach((item) => {
    let bestShelfIndex = -1
    let bestShelfWaste = Number.POSITIVE_INFINITY

    for (let index = 0; index < shelves.length; index += 1) {
      const shelf = shelves[index]
      const nextHeight = Math.max(shelf.height, item.height)
      if (shelf.x + item.width > rollW + 0.001) continue
      if (shelf.y + nextHeight > rollL + 0.001) continue

      const remainingWidth = rollW - (shelf.x + item.width)
      const heightPenalty = nextHeight - shelf.height
      const shelfWaste = remainingWidth + heightPenalty * 0.75

      if (shelfWaste < bestShelfWaste) {
        bestShelfWaste = shelfWaste
        bestShelfIndex = index
      }
    }

    if (bestShelfIndex === -1) {
      const nextY =
        shelves.length === 0 ? 0 : Math.max(...shelves.map((shelf) => shelf.y + shelf.height))
      if (nextY + item.height > rollL + 0.001) return
      shelves.push({ y: nextY, height: item.height, x: 0 })
      bestShelfIndex = shelves.length - 1
    }

    const shelf = shelves[bestShelfIndex]
    placedItems.push({
      ...item,
      x: shelf.x,
      y: shelf.y,
      flipped: flipPattern === "checker" ? placedIndex % 2 === 1 : (item.flipped ?? false),
    })
    placedIndex += 1
    shelf.x += item.width
    shelf.height = Math.max(shelf.height, item.height)
    usedArea += item.usedArea
  })

  const bounds = getPlacementBounds(placedItems)
  return {
    items: placedItems,
    usedArea,
    occupiedWidth: bounds.occupiedWidth,
    occupiedHeight: bounds.occupiedHeight,
  }
}
```

### 3. Guillotine Cutting (`nesting-packing-utils.ts`)

For rectangle-only layouts. Simulates real cutting constraints (each cut goes edge-to-edge):

```
1. Start with one free rectangle = full stock sheet
2. Sort items by selected criterion
3. For each item:
   a. Find smallest free rectangle that fits (short-side-fit heuristic)
   b. Try both orientations (original + rotated 90 deg)
   c. Place item in corner of free rect
   d. Split remaining space into right-split and bottom-split
   e. Add splits as new free rectangles
   f. Remove subsumed (fully contained) free rects
4. Remaining free rects = offcut/waste bands
```

This produces layouts that can be physically cut with a straight blade — every cut divides the stock into two pieces.

Actual guillotine packing implementation:

```typescript
export function packRectItemsWithGuillotine(
  items: Array<PreviewItem & { usedArea: number }>,
  rollW: number,
  rollL: number,
  sortBy: PreviewPackSort
): PackedPreviewItemsResult {
  const sortedItems = sortPreviewItems(items, sortBy)
  let freeRects: OffcutBand[] = [{ x: 0, y: 0, width: rollW, height: rollL }]
  const placedItems: PreviewItem[] = []
  let usedArea = 0

  // Prune free rects that are too small or subsumed by larger ones
  const pruneFreeRects = (rects: OffcutBand[]) =>
    rects.filter((rect, index) => {
      if (rect.width <= 0.25 || rect.height <= 0.25) return false
      return !rects.some((other, otherIndex) => {
        if (index === otherIndex) return false
        return (
          rect.x >= other.x &&
          rect.y >= other.y &&
          rect.x + rect.width <= other.x + other.width &&
          rect.y + rect.height <= other.y + other.height
        )
      })
    })

  sortedItems.forEach((item) => {
    let best: RectPlacementChoice | null = null

    // Try both orientations (original + rotated 90°)
    const orientations = [
      { width: item.width, height: item.height, rotated: false },
      ...(Math.abs(item.width - item.height) > 0.001
        ? [{ width: item.height, height: item.width, rotated: true }]
        : []),
    ]

    // Find best fit using short-side-fit heuristic across all free rects
    freeRects.forEach((freeRect, freeIndex) => {
      orientations.forEach((orientation) => {
        if (
          orientation.width > freeRect.width + 0.001 ||
          orientation.height > freeRect.height + 0.001
        )
          return
        // ... short-side-fit comparison logic ...
      })
    })

    if (!best) return
    const chosen = best as RectPlacementChoice
    const host = freeRects[chosen.freeIndex]
    placedItems.push({ ...item, x: host.x, y: host.y, width: chosen.width, height: chosen.height })
    usedArea += item.usedArea

    // Split remaining space into right-split and bottom-split
    const nextRects = freeRects.filter((_, index) => index !== chosen.freeIndex)
    nextRects.push(
      {
        x: host.x + chosen.width,
        y: host.y,
        width: host.width - chosen.width,
        height: chosen.height,
      },
      {
        x: host.x,
        y: host.y + chosen.height,
        width: host.width,
        height: host.height - chosen.height,
      }
    )
    freeRects = pruneFreeRects(nextRects)
  })

  const bounds = getPlacementBounds(placedItems)
  return {
    items: placedItems,
    usedArea,
    occupiedWidth: bounds.occupiedWidth,
    occupiedHeight: bounds.occupiedHeight,
    freeRects,
  }
}
```

### 4. NFP (No-Fit Polygon) Optimization

For complex shapes. Uses a genetic algorithm to optimize placement:

#### Shape Conversion (`nesting-nfp-helpers.ts`)

Each UI shape is converted to a polygon:

- **Rectangle** → 4-vertex polygon
- **Circle** → 24-sided regular polygon (approximation)
- **Cylinder** → Unrolled rectangle(s): `width = pi * diameter`
- **Cone** → Annular sector polygon using arc sampling
- **Trapezoid** → 4-vertex polygon with different top/bottom widths

Actual conversion dispatcher:

```typescript
export function simplePartToNestingParts(
  spec: SimplePartSpec,
  fallbackW: number,
  fallbackH: number,
  index: number
): NestingPart[] {
  const id = `part-${index}`
  const qty = Math.max(1, spec.quantity || 1)

  switch (spec.partType) {
    case "circle":
      return buildCircleParts(spec, id, qty, fallbackW, index)
    case "cylinder":
      return buildCylinderParts(spec, id, qty, fallbackW, fallbackH, index)
    case "cone":
      return buildConeParts(spec, id, qty, fallbackW, fallbackH, index)
    case "trapezoid":
      return buildTrapezoidParts(spec, id, qty, fallbackW, fallbackH, index)
    case "rectangle":
    default:
      return buildRectParts(spec, id, qty, fallbackW, fallbackH, index)
  }
}
```

Example — cylinder part builder (splits circumference into panels or bands):

```typescript
function buildCylinderParts(
  spec: SimplePartSpec,
  id: string,
  qty: number,
  fallbackW: number,
  fallbackH: number,
  index: number
): NestingPart[] {
  const circumference = spec.diameter ? Math.PI * spec.diameter : fallbackW
  const h = spec.height ?? fallbackH
  if (qty > 1) {
    const ratios = normalizeCutRatios(spec.cutRatios, qty)
    return ratios.map((ratio, pieceIndex) => {
      const pieceWidth = isCylinderPanelSplit(spec.cutDirection)
        ? circumference * ratio
        : circumference
      const pieceHeight = isCylinderPanelSplit(spec.cutDirection) ? h : h * ratio
      const pieceId = `${id}-piece-${pieceIndex}`
      return {
        id: pieceId,
        polygon: { id: pieceId, points: rectToPolygon(pieceWidth, pieceHeight) },
        quantity: 1,
        sourceSpecIndex: index,
        pieceIndex,
        piecesPerUnit: qty,
        renderShape: "rect",
        originalSpec: {
          width: pieceWidth,
          height: pieceHeight,
          cutDirection: spec.cutDirection,
          label: `${formatInches(pieceWidth)}" × ${formatInches(pieceHeight)}"`,
        },
      }
    })
  }
  return [
    {
      id,
      polygon: { id, points: rectToPolygon(circumference, h) },
      quantity: qty,
      sourceSpecIndex: index,
      pieceIndex: 0,
      piecesPerUnit: 1,
      renderShape: "rect",
      originalSpec: {
        width: circumference,
        height: h,
        label: `${formatInches(circumference)}" × ${formatInches(h)}"`,
      },
    },
  ]
}
```

Result-to-preview conversion signature:

```typescript
export function nestingResultToPreviewItems(
  result: NestingResult,
  parts: NestingPart[],
  specs: SimplePartSpec[],
  fallbackW: number,
  fallbackH: number
): PreviewItem[] {
  const partsById = new Map(parts.map((part) => [part.id, part]))
  return result.placements.map((p) => {
    const partIdBase = p.partId.replace(/-\d+$/, "")
    const np = partsById.get(partIdBase) ?? parts[0]
    const spec = specs[np?.sourceSpecIndex ?? 0] ?? specs[0]
    const rs = np?.renderShape ?? "rect"

    const base: PreviewItem = {
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.height,
      flipped: p.flipped,
      rotation: p.rotation,
      placedPolygon: p.placedPolygon,
      renderShape:
        rs === "circle"
          ? "circle"
          : rs === "sector"
            ? "sector"
            : rs === "trapezoid"
              ? "trapezoid"
              : "rect",
      label: "",
    }

    // Apply shape-specific fields (diameter, radii, trapezoid widths, etc.)
    if (rs === "circle") applyCircleFields(base, np, spec, fallbackW)
    else if (rs === "sector") applySectorFields(base, np)
    else if (rs === "trapezoid") applyTrapezoidFields(base, np, fallbackW, fallbackH)
    else applyRectFields(base, np, p)
    return base
  })
}
```

#### Splitting

Shapes can be split into multiple pieces based on `cutRatios`:

- **Cylinder**: Split circumference into panels (vertical cuts) or bands (horizontal cuts)
- **Cone**: Split into radial sections or arc sections
- **Trapezoid**: Split vertically or horizontally with proportional widths

#### GA Solver (`lib/nesting/nfp-solver.ts`)

```
Population: 4-8 individuals (layout permutations)
Generations: 10-18 (based on piece count)
Mutation: Random swap/rotation of pieces

Each individual = ordered list of parts + rotations
Fitness = total area occupied (lower is better)

For each individual:
  1. Place parts one-by-one using NFP
  2. NFP = set of valid positions for part B given part A is placed
  3. Choose position that minimizes wasted space
  4. Track placements, compute occupied area
```

#### NFP Computation

The No-Fit Polygon of shape A relative to shape B defines all positions where B can be placed without overlapping A. Computed using Clipper-lib (Vatti polygon clipping algorithm):

```
NFP(A, B) = Minkowski sum of A and reflected(-B)
Valid placements for B = points inside/on NFP boundary
```

### 5. Waste Analysis (`nesting-preview-builders.ts`)

After placement, waste is categorized:

```
Total stock area = rollW * rollL
Used area = sum of placed piece areas
Waste area = stock area - used area

Waste breakdown:
  Reusable offcut = waste bands large enough to fit another piece
  Scrap = waste bands too small to reuse
  Intra-blank waste = waste inside shape cutouts (e.g., circle inscribed in square)
```

Actual waste computation (from `withWaste`):

```typescript
export function withWaste(preview: RectLikePreview, rollW: number, rollL: number): RectLikePreview {
  const rollArea = rollW * rollL
  const positioned =
    preview.placementMode === "center"
      ? centerPlacements(preview.placements, rollW, rollL)
      : {
          positions: preview.placements,
          occupiedWidth: preview.occupiedWidth,
          occupiedHeight: preview.occupiedHeight,
        }
  const bounds = getPlacementBounds(positioned.positions)
  const pieceW = positioned.positions[0]?.width ?? 0
  const pieceH = positioned.positions[0]?.height ?? 0

  if (preview.wasteMode === "bands" && preview.placementMode === "origin") {
    if (preview.renderShape === "rect") {
      const allBands = buildOriginRectOffcutBands(positioned.positions, rollW, rollL)
      const reusableBands: OffcutBand[] = []
      const scrapBands: OffcutBand[] = []
      let reusableArea = 0
      let scrapArea = 0

      allBands.forEach((band) => {
        const area = band.width * band.height
        if (isReusableOffcutBand(band, pieceW, pieceH)) {
          reusableBands.push(band)
          reusableArea += area
        } else {
          scrapBands.push(band)
          scrapArea += area
        }
      })

      const totalWasteArea = reusableArea + scrapArea
      return {
        ...preview,
        placements: positioned.positions,
        wasteArea: totalWasteArea,
        wastePct: rollArea > 0 ? (totalWasteArea / rollArea) * 100 : 100,
        reusableArea,
        scrapArea,
        offcutBands: reusableBands,
        scrapBands,
      }
    }

    // Non-rect shapes: also account for intra-blank waste
    const allBands = buildOffcutBands(bounds, rollW, rollL, "origin")
    // ... classify bands as reusable vs scrap ...
    const intraBlankWaste = preview.items.reduce(
      (sum, item) => sum + computeIntraBlankWaste(item),
      0
    )
    // scrapArea += intraBlankWaste
    // ...
  }
  // ...
}
```

### 6. Fabrication Score (`nesting-preview-builders.ts`)

Composite score 0-100:

```
wasteScore     = max(0, 100 - wastePct * 2)              // 40% weight
reusableScore  = (reusableArea / wasteArea) * 100         // 20% weight
seamScore      = max(0, 100 - seamCount * 15)             // 20% weight
nestingScore   = (placedArea / occupiedBboxArea) * 100    // 20% weight

finalScore = 0.4 * wasteScore + 0.2 * reusableScore + 0.2 * seamScore + 0.2 * nestingScore
```

Actual implementation:

```typescript
export function computeFabricationScore(preview: SimplePreviewBase, rollW: number, rollL: number) {
  const rollArea = rollW * rollL
  const wastePct = rollArea > 0 ? (preview.wasteArea / rollArea) * 100 : 100
  const wasteScore = Math.max(0, 100 - wastePct * 2)

  const reusablePct = preview.wasteArea > 0 ? (preview.reusableArea / preview.wasteArea) * 100 : 0
  const reusableScore = Math.min(100, reusablePct)

  const seams = preview.piecesPerUnit
  const seamScore =
    seams <= 1 ? 100 : seams <= 2 ? 85 : seams <= 4 ? 60 : Math.max(0, 100 - seams * 8)

  const occupied = preview.occupiedWidth * preview.occupiedHeight
  const nestingEff = occupied > 0 ? (preview.usedArea / occupied) * 100 : 0
  const nestingScore = Math.min(100, nestingEff)

  const score = Math.round(
    wasteScore * 0.4 + reusableScore * 0.2 + seamScore * 0.2 + nestingScore * 0.2
  )
  return {
    score,
    breakdown: {
      wasteScore: Math.round(wasteScore),
      reusableScore: Math.round(reusableScore),
      seamScore: Math.round(seamScore),
      nestingScore: Math.round(nestingScore),
    },
  }
}
```

### 7. Multi-Part Layout (`nesting-shape-previews-dispatch.ts`)

When multiple different parts are placed together:

```
1. Generate items from all part specs
2. Try 4 sorting strategies: area, height, width, max-edge
3. For each strategy:
   a. Pack using guillotine (rects) or shelf (mixed shapes)
   b. Compute bounds, waste bands, scrap analysis
   c. Score by: items placed, scrap area, trim density, reusable area
4. Select best strategy
5. Return combined preview
```

Actual implementation:

```typescript
export function generateMultiPartPreview(
  rollW: number,
  rollL: number,
  simpleParts: SimplePartSpec[],
  fallbackWidth: number,
  fallbackHeight: number
): SimplePartPreview {
  // Expand all specs into individual placement items
  const requestedItems = simpleParts.flatMap((spec) =>
    Array.from({ length: Math.max(1, spec.quantity || 1) }, () =>
      buildPartPreviewItem(spec, fallbackWidth, fallbackHeight)
    )
  )
  const allRectangles = requestedItems.every((item) => item.renderShape === "rect")

  // Try all 4 sorting strategies, pick the best
  const candidates = (["area", "height", "width", "max-edge"] as const).map((sortBy) =>
    evaluatePackingCandidate(requestedItems, rollW, rollL, sortBy, allRectangles)
  )
  candidates.sort(comparePackingCandidates)

  const best = candidates[0]
  const placedItems = best?.packed.items ?? []
  const usedArea = best?.packed.usedArea ?? 0
  const wasteArea = (best?.reusableArea ?? 0) + (best?.scrapArea ?? 0)
  // ...build and return SimplePartPreview with best candidate metrics...
}
```

Candidate evaluation (per sorting strategy):

```typescript
function evaluatePackingCandidate(
  requestedItems: (PreviewItem & { usedArea: number })[],
  rollW: number,
  rollL: number,
  sortBy: "area" | "height" | "width" | "max-edge",
  allRectangles: boolean
): PackingCandidate {
  const packed = allRectangles
    ? packRectItemsWithGuillotine(requestedItems, rollW, rollL, sortBy)
    : packPreviewItemsOnShelves(requestedItems, rollW, rollL, sortBy)

  const allBands = allRectangles
    ? (packed.freeRects ?? [])
    : buildShelfGapBands(packed.items, rollW, rollL)

  // Classify bands as reusable offcuts vs scrap
  // Add intra-blank waste for non-rectangular shapes
  const intraBlankWaste = packed.items.reduce((sum, item) => sum + computeIntraBlankWaste(item), 0)
  const trimDensity =
    bounds.occupiedWidth * bounds.occupiedHeight > 0
      ? scrapArea / (bounds.occupiedWidth * bounds.occupiedHeight)
      : 1

  return { sortBy, packed, bounds, offcutBands, scrapBands, reusableArea, scrapArea, trimDensity }
}

function comparePackingCandidates(a: PackingCandidate, b: PackingCandidate): number {
  if (a.packed.items.length !== b.packed.items.length)
    return b.packed.items.length - a.packed.items.length // more items placed = better
  if (Math.abs(a.scrapArea - b.scrapArea) > 0.001) return a.scrapArea - b.scrapArea // less scrap = better
  if (Math.abs(a.trimDensity - b.trimDensity) > 0.0001) return a.trimDensity - b.trimDensity // lower trim density = better
  if (Math.abs(a.reusableArea - b.reusableArea) > 0.001) return b.reusableArea - a.reusableArea // more reusable area = better
  if (Math.abs(a.bounds.occupiedHeight - b.bounds.occupiedHeight) > 0.001)
    return a.bounds.occupiedHeight - b.bounds.occupiedHeight // shorter = better
  return 0
}
```

### 8. Hooks (`use-nesting-compute.ts`, `use-nfp-optimizer.ts`)

#### Main Nesting Hook (`use-nesting-compute.ts`)

The primary hook manages all nesting state and returns a comprehensive result interface:

```typescript
interface UseNestingComputeResult {
  // shared state
  shape: ShapeType
  setShape: (s: ShapeType) => void
  rollW: number
  setRollW: (v: number) => void
  rollL: number
  setRollL: (v: number) => void
  // rect mode
  cutW: number
  setCutW: (v: number) => void
  cutH: number
  setCutH: (v: number) => void
  qty: number
  setQty: (v: number) => void
  diagAng: number
  setDiagAng: (v: number) => void
  ddir: DiagDir
  setDdir: (d: DiagDir) => void
  grain: GrainDir
  setGrain: (g: GrainDir) => void
  activeId: string
  setActiveId: (id: string) => void
  activeStep: number
  setActiveStep: (s: number) => void
  scored: ScoredStrategy[]
  // circle
  diam: number
  setDiam: (v: number) => void
  // cone
  innerR: number
  setInnerR: (v: number) => void
  outerR: number
  setOuterR: (v: number) => void
  arcDeg: number
  setArcDeg: (v: number) => void
  // non-rect stats
  bgStats: { count: number; used: number; waste: number }
  setBgStats: (s: { count: number; used: number; waste: number }) => void
  // view mode
  viewMode: "stock" | "profile"
  setViewMode: (m: "stock" | "profile") => void
  // NFP solver
  optimizedResult: NestingResult | null
  optimizedItems: PreviewItem[] | null
  isOptimizing: boolean
  nfpError: string | null
  // simple mode computed
  activeSimpleSpecs: SimplePartSpec[]
  baseSimplePreview: SimplePartPreview | null
  // refs
  nfpSolverRef: React.MutableRefObject<NFPSolver | null>
  bgSvgRef: React.RefObject<SVGSVGElement | null>
  detailRef: React.RefObject<SVGSVGElement | null>
  miniRefs: React.MutableRefObject<Record<string, SVGSVGElement>>
  renderBg: () => void
}
```

Hook signature and key internal logic:

```typescript
export function useNestingCompute(props: NestingVisualizerProps): UseNestingComputeResult {
  const {
    defaultRollWidth = 48,
    defaultRollLength = 96,
    defaultCutWidth = 24,
    defaultCutHeight = 12,
    defaultQty = 6,
    simpleMode = false,
    simplePart,
    simpleParts,
  } = props

  // Derive active specs from props (simpleParts > simplePart > defaults)
  const activeSimpleSpecs = useMemo(() => {
    if (simpleParts && simpleParts.length > 0) return simpleParts
    if (simplePart) return [simplePart]
    return [
      {
        partType: "rectangle" as const,
        quantity: defaultQty,
        width: defaultCutWidth,
        length: defaultCutHeight,
      },
    ]
  }, [simpleParts, simplePart, defaultQty, defaultCutWidth, defaultCutHeight])

  // Compute base preview (multi-part vs single-part routing)
  const baseSimplePreview = useMemo<SimplePartPreview | null>(() => {
    if (!simpleMode) return null
    return activeSimpleSpecs.length > 1
      ? generateMultiPartPreview(
          defaultRollWidth,
          defaultRollLength,
          activeSimpleSpecs,
          defaultCutWidth,
          defaultCutHeight
        )
      : generateSimplePartPreview(
          defaultRollWidth,
          defaultRollLength,
          activeSimpleSpecs[0],
          defaultCutWidth,
          defaultCutHeight,
          defaultQty
        )
  }, [
    simpleMode,
    activeSimpleSpecs,
    defaultRollWidth,
    defaultRollLength,
    defaultCutWidth,
    defaultCutHeight,
    defaultQty,
  ])

  // Rect strategy scoring (runs when rect mode dimensions change)
  useEffect(() => {
    if (simpleMode || shape !== "rect") return
    const strats = getStrategies(cutW, cutH, diagAng, ddir)
    const results = strats.map((s) => scoreStrat(s, rollW, rollL, qty, grain))
    results.sort((a, b) => b.score - a.score)
    queueMicrotask(() => {
      setScored(results)
      if (!activeId || !results.find((r) => r.id === activeId)) {
        setActiveId(results[0]?.id ?? "")
        setActiveStep(0)
      }
    })
  }, [simpleMode, shape, rollW, rollL, cutW, cutH, qty, diagAng, ddir, grain, activeId])

  // ...NFP background optimizer, non-rect render callback, cleanup...
  return { shape, setShape, rollW, setRollW /* ...all state and refs... */ }
}
```

#### NFP Optimizer Hook (`use-nfp-optimizer.ts`)

Manages the NFP solver lifecycle (creation, execution, cancellation):

```typescript
interface NFPOptimizerResult {
  optimizedResult: NestingResult | null
  optimizedItems: PreviewItem[] | null
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
): NFPOptimizerResult {
  const nfpSolverRef = useRef<NFPSolver | null>(null)
  const [optimizedResult, setOptimizedResult] = useState<NestingResult | null>(null)
  const [optimizedItems, setOptimizedItems] = useState<PreviewItem[] | null>(null)
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [nfpError, setNfpError] = useState<string | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      nfpSolverRef.current?.cancel()
    }
  }, [])

  useEffect(() => {
    if (!simpleMode) return
    // Reset state
    queueMicrotask(() => {
      setOptimizedResult(null)
      setOptimizedItems(null)
      setIsOptimizing(false)
      setNfpError(null)
    })

    if (!shouldAutoOptimizeInteractiveLayout(activeSimpleSpecs)) return

    // Convert UI specs to NestingParts
    const nestingParts: NestingPart[] = activeSimpleSpecs.flatMap((spec, i) =>
      simplePartToNestingParts(spec, defaultCutWidth, defaultCutHeight, i)
    )

    // Scale GA parameters based on piece count
    const totalRequestedPieces = nestingParts.reduce((sum, part) => sum + part.quantity, 0)
    const generations = totalRequestedPieces > 16 ? 10 : totalRequestedPieces > 8 ? 14 : 18
    const populationSize = totalRequestedPieces > 16 ? 4 : totalRequestedPieces > 8 ? 6 : 8

    const input: NestingInput = {
      binWidth: defaultRollWidth,
      binHeight: defaultRollLength,
      parts: nestingParts,
      spacing: 0.125,
      rotationSteps: 4,
      generations,
      populationSize,
      mutationRate: 0.2,
    }

    if (!nfpSolverRef.current) nfpSolverRef.current = new NFPSolver()

    let cancel: (() => void) | null = null
    const timer = window.setTimeout(() => {
      setIsOptimizing(true)
      cancel = nfpSolverRef.current!.solve(input, {
        onComplete: (result) => {
          const items = nestingResultToPreviewItems(
            result,
            nestingParts,
            activeSimpleSpecs,
            defaultCutWidth,
            defaultCutHeight
          )
          setOptimizedResult(result)
          setOptimizedItems(items.length > 0 ? items : null)
          setIsOptimizing(false)
        },
        onError: (msg) => {
          setNfpError(msg)
          setOptimizedResult(null)
          setOptimizedItems(null)
          setIsOptimizing(false)
        },
      })
    }, 220)

    return () => {
      window.clearTimeout(timer)
      cancel?.()
      setIsOptimizing(false)
    }
  }, [nfpInputKey, simpleMode, activeSimpleSpecs /* ...deps... */])

  return { optimizedResult, optimizedItems, isOptimizing, nfpError }
}
```

### 9. Simple Mode Layout Computation (`nesting-viz-simple-layout.ts`)

Pure computation that derives all SVG layout values from a preview:

```typescript
export interface SimpleModeLayout {
  displayPreview: SimplePartPreview
  isOptimizedResult: boolean
  fabScore: {
    score: number
    breakdown: {
      wasteScore: number
      reusableScore: number
      seamScore: number
      nestingScore: number
    }
  }
  stockSqFt: number
  usedSqFt: number
  reusableOffcutSqFt: number
  scrapSqFt: number
  reusableOffcutPct: number
  scrapPct: number
  layoutNote: string
  displayItems: PreviewItem[]
  shapeFirstView: boolean
  // SVG geometry
  viewWidth: number
  viewHeight: number
  scale: number
  surfaceX: number
  surfaceY: number
  surfacePxW: number
  surfacePxH: number
  unitOriginX: number
  unitOriginY: number
  canvasUnitsW: number
  canvasUnitsH: number
  // Pattern/marker IDs
  stockPatternId: string
  offcutPatternId: string
  wastePatternId: string
  usablePatternId: string
  markerId: string
  // Metrics labels
  requestedCutPieceCount: number
  isSplitStockPreview: boolean
  missingCutPieceCount: number
  pieceCountLabel: string
  pieceCountValue: string
  previewTitle: string
  // ...additional layout geometry, offcut labels, cut plan visibility...
}
```

Core function signature and key logic:

```typescript
export function computeSimpleModeLayout(input: SimpleModeLayoutInput): SimpleModeLayout {
  const {
    preview,
    previewRollW,
    previewRollL,
    patternSeed,
    viewMode,
    optimizedResult,
    optimizedItems,
  } = input

  // Compare heuristic vs NFP-optimized layout, pick the better one
  let displayPreview: SimplePartPreview = preview
  if (viewMode === "stock" && optimizedResult && optimizedItems?.length) {
    const optimizedStockPreview = buildOptimizedStockPreview(
      preview,
      optimizedResult,
      optimizedItems,
      previewRollW,
      previewRollL
    )
    if (compareStockLayoutPreviews(optimizedStockPreview, preview) < 0) {
      displayPreview = optimizedStockPreview
    }
  }

  // Compute fabrication score and area metrics
  const fabScore = computeFabricationScore(displayPreview, previewRollW, previewRollL)
  const stockSqFt = (previewRollW * previewRollL) / 144
  const usedSqFt = displayPreview.usedArea / 144
  const reusableOffcutSqFt = displayPreview.reusableArea / 144
  const scrapSqFt = displayPreview.scrapArea / 144

  // SVG viewport and scaling
  const viewWidth = 980
  const viewHeight = 560
  const drawWidth = viewWidth - 74 - 112 // padLeft + padRight
  const drawHeight = viewHeight - 82 - 80 // padTop + padBottom
  const canvasUnitsW = previewRollW
  const canvasUnitsH = previewRollL
  const scale = Math.min(drawWidth / canvasUnitsW, drawHeight / canvasUnitsH)
  const surfacePxW = canvasUnitsW * scale
  const surfacePxH = canvasUnitsH * scale
  const surfaceX = 74 + (drawWidth - surfacePxW) / 2
  const surfaceY = 82 + (drawHeight - surfacePxH) / 2

  // ...derive pattern IDs, label positions, metric strings, offcut label bands...
  return { displayPreview, isOptimizedResult, fabScore, stockSqFt, usedSqFt, scale /* ... */ }
}
```

### 10. Global Multi-Sheet Bin Packing (`nesting-global-packer.ts`)

When multiple distinct part types are packed together (e.g., a 45-part cut list with different sizes), the global packer replaces the sequential per-sheet overflow approach with a globally-optimal assignment. This produces fewer sheets for the same set of items.

The engine implements all 5 MaxRects heuristics from Jukka Jylänki's "A Thousand Ways to Pack the Bin" (2010) paper, combined with batch insertion from Python's rectpack library and multi-start optimization across 70 candidate configurations.

**All 5 heuristics (from Jylänki's reference implementation):**

| Heuristic                      | Primary Score (minimize) | Tiebreaker          | Intuition                          |
| ------------------------------ | ------------------------ | ------------------- | ---------------------------------- |
| **BSSF** (Best Short Side Fit) | `min(leftH, leftV)`      | `max(leftH, leftV)` | Snug fit on at least one edge      |
| **BLSF** (Best Long Side Fit)  | `max(leftH, leftV)`      | `min(leftH, leftV)` | Avoid creating thin slivers        |
| **BAF** (Best Area Fit)        | `freeArea - itemArea`    | `min(leftH, leftV)` | Least wasted area in free rect     |
| **BL** (Bottom-Left)           | `freeY + itemH`          | `freeX`             | Gravity/Tetris-style packing       |
| **CP** (Contact Point)         | `-contactLength`         | —                   | Maximum adjacency with walls/items |

**Three packing modes run in parallel:**

```
Mode 1 — Batch Insertion (Jylänki Insert + rectpack Global):
  For each bin, repeatedly pick the best-fitting remaining item.
  5 heuristics × 2 bin orientations = 10 candidates.

Mode 2 — Greedy with BBF (Bin Best Fit):
  Process items in sort order, try ALL bins for each item.
  5 heuristics × 6 sort strategies × 2 bin orientations = 60 candidates.

Mode 3 — Width-Pair Packing (novel hybrid — see below):
  Group items by similar width (±1" tolerance), pair them side-by-side
  as virtual rectangles, pack through MaxRects, then unpack.
  5 heuristics × 2 bin orientations = 10 candidates.

Total: 80 candidates evaluated, best result kept.
```

**Algorithm overview:**

```
1. Expand all SimplePartSpec[] into individual packable items
2. For each of 80 candidate configurations:
   a. Pack items using batch insertion, greedy BBF, or width-pair packing
   b. Exhaustive rotation search on the last bin (2^n combos, n <= 14)
   c. Build SheetPreview for each bin
   d. Score: most items placed → fewest sheets → tightest packing
3. Return the best MultiSheetResult across all candidates
```

#### Width-Pair Packing (`nesting-width-pair-packer.ts`)

Mode 3 exploits the fact that many cut lists contain items with similar widths. For example, on 78" stock with 35.5"-wide items, two items fit side-by-side (71" total, 7" residual) — a layout MaxRects cannot discover when treating items individually.

**How it works:**

```
1. Group items by width within ±1" tolerance
   - Exclude items wider than binWidth/2 (can't pair)
   - Sort groups by member count descending

2. Pair items within each group by length descending
   - (tallest, 2nd tallest), (3rd, 4th), etc.
   - Minimizes height gaps within each virtual rectangle
   - Odd item remains unpaired

3. Create virtual composite rectangles
   - Each pair → width = leftW + rightW, height = max(leftH, rightH)
   - Unpaired items pass through as-is

4. Pack virtual items through standard MaxRects batch fill

5. Unpack pair placements back to individual items
   - Normal: left at (x, y), right at (x + leftW, y)
   - Rotated: left at (x, y) rotated, right at (x, y + leftW) rotated
```

**This is a novel hybrid approach.** Research across 10+ open-source packing repositories found no existing implementation that creates virtual composite rectangles from paired items before feeding them to a packing engine. The approach combines elements from three established algorithm families:

| Component                           | Closest Algorithm                          | Our Innovation                                                      |
| ----------------------------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| Group by width similarity           | Split-Fit (width bands)                    | Absolute tolerance (±1") instead of fractional bin-width thresholds |
| Pair longest-with-next-longest      | Floor-Ceiling (pack both edges of a level) | Pre-pairing before packing, not during                              |
| Virtual rectangles through MaxRects | Standard MaxRects pipeline                 | Composite items as MaxRects input — reduces problem size            |

**Key difference from guillotine packing:** When an item is placed, MaxRect clips ALL overlapping free rectangles (not just the hosting one), generating up to 4 sub-rects per overlap. This allows items to be placed in positions that span multiple free regions.

---

## Open Source Attribution

The global multi-sheet bin packing system (`nesting-global-packer.ts`) was built by porting and adapting algorithms from three open-source repositories. Each repository contributed a specific capability to our system.

### 1. RectangleBinPack — Jukka Jylänki's MaxRects Reference Implementation

- **Repository:** [https://github.com/juj/RectangleBinPack](https://github.com/juj/RectangleBinPack)
- **License:** Public domain
- **Paper:** "A Thousand Ways to Pack the Bin — A Practical Approach to Two-Dimensional Rectangle Bin Packing" (2010)
- **What it does:** The definitive C++ reference implementation of the MaxRects bin packing algorithm. Implements all 5 placement heuristics (BSSF, BLSF, BAF, BL, CP), the free rectangle splitting strategy, containment-based pruning, and batch insertion (the `Insert()` method that picks the globally best item-position pair at each step).
- **What we ported:**
  - All 5 `FindPositionForNewNode*` scoring functions → `scoreRect()` method with `HeuristicType` parameter
  - `SplitFreeNode()` overlap splitting → `place()` method (4-way maximal remainder generation)
  - `PruneFreeList()` + `InsertNewFreeRectangle()` → containment pruning in `place()`
  - `Insert(vector<RectSize>)` batch insertion strategy → `batchFillBin()` function
  - `ContactPointScoreNode()` + `CommonIntervalLength()` → `contactPointScore()` private method
- **Value to our system:** The 5 heuristics cover different item geometry profiles — BSSF works best for snug fits, BAF for varied sizes, CP for clustering, BL for gravity-style layouts. Running all 5 and keeping the best result produces significantly tighter packing than BSSF alone. The batch insertion strategy (picking the globally best item at each step rather than processing a fixed sort order) is the single largest quality improvement.

### 2. rectpack — Python 2D Rectangle Packing Library

- **Repository:** [https://github.com/secnot/rectpack](https://github.com/secnot/rectpack)
- **License:** Apache 2.0
- **What it does:** A comprehensive Python library implementing MaxRects, Guillotine, and Skyline algorithms with 4 bin-selection strategies (BNF, BFF, BBF, Global) and 7 sort orders. The key innovation is the `PackerGlobal` strategy that reverses the packing loop: instead of "for each item, find a bin", it does "for each bin, find the best item."
- **What we ported:**
  - `PackerGlobal` strategy → `globalBatchPack()` function (fills each bin using batch insertion before opening the next)
  - `PackerBBFMixin` (Bin Best Fit) → `globalGreedyPack()` function (for each item, tries ALL bins and picks the best fit)
  - Sort strategies: `SORT_AREA`, `SORT_PERI`, `SORT_SSIDE`, `SORT_LSIDE`, `SORT_DIFF` → 6 sort functions in `globalMultiSheetPack()`
  - Per-placement rotation evaluation (both orientations scored against all free rects) → integrated into `scoreRect()`
- **Value to our system:** The Global + BBF dual-mode approach covers both "fill bins optimally" (batch) and "assign items to best bin" (greedy) strategies. Different item mixes favor different modes — running both and keeping the best result catches cases where one mode outperforms the other.

### 3. maxrects-packer — TypeScript MaxRects Implementation

- **Repository:** [https://github.com/soimy/maxrects-packer](https://github.com/soimy/maxrects-packer)
- **License:** MIT
- **What it does:** A TypeScript MaxRects implementation designed for sprite sheet generation. Features smart bin sizing, power-of-2 rounding, tag-based grouping, and per-rectangle rotation overrides. The most popular JS MaxRects library (14k+ weekly npm downloads).
- **What we referenced:**
  - `splitNode()` implementation for split/prune correctness verification
  - `findNode()` scoring logic as a cross-reference against Jylänki's C++ original
  - `pruneFreeList()` containment check pattern
  - Rotation handling pattern (per-rect `allowRotation` override)
- **Value to our system:** Used as a TypeScript reference implementation to verify our port of Jylänki's C++ code was correct. The library's split/prune logic confirmed our implementation handles edge cases (overlapping maximal rectangles, tiny remainder filtering) correctly.

### Research References (Width-Pair Packing)

The following repositories were analyzed during the design of Mode 3 (width-pair packing). None implement our exact approach, but each contributed to validating the algorithm design:

- **greedypacker** ([github.com/solomon-b/greedypacker](https://github.com/solomon-b/greedypacker), Apache 2.0) — Python library implementing Shelf, Guillotine, MaxRects, and Skyline algorithms. Its shelf mode with `best_width_fit` heuristic is the closest open-source equivalent to width-aware packing, though it groups by shelf height, not item width similarity.
- **shelf-pack** ([github.com/mapbox/shelf-pack](https://github.com/mapbox/shelf-pack), ISC) — JavaScript shelf packing library from Mapbox. Documentation notes it "works best when rectangles have similar heights" but performs no pre-grouping — exactly the gap our width-pair approach fills.
- **BinPack** ([github.com/hellerbarde/BinPack](https://github.com/hellerbarde/BinPack), public domain) — Python Shelf + Guillotine implementation with 8 heuristics each, including `best_width_fit`. Confirmed that no existing shelf algorithm pre-pairs items by dimensional similarity.

### Historical References

The following repositories influenced the original v1 implementation and contributed conceptual approaches still present in the codebase:

- **G2DBP** ([github.com/tsinghua-fib-lab/G2DBP](https://github.com/tsinghua-fib-lab/G2DBP), MIT) — Original source for the MaxRect BSSF packing engine and global multi-bin assignment loop. Replaced by Jylänki's reference implementation with all 5 heuristics.
- **D-Wave 3D Bin Packing** ([github.com/dwave-examples/3d-bin-packing](https://github.com/dwave-examples/3d-bin-packing), Apache 2.0) — Height minimization objective concept. Adapted to 2D: our exhaustive rotation search minimizes `occupiedHeight` on the last sheet for dynamic stock sizing.
- **Exhaustive Grid Search** ([github.com/DavidBoja/exhaustive-grid-search](https://github.com/DavidBoja/exhaustive-grid-search), MIT) — Exhaustive rotation enumeration pattern. Adapted from 3D SO(3) rotation search to 2D binary rotation masks (2^n combinations for n items).
