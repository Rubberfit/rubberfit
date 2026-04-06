# nesting/

NFP (No-Fit Polygon) nesting engine for the cut planner. Packs irregularly-shaped parts onto rectangular stock material (rolls) to minimize waste.

## How it works

1. Parts (rectangles, circles, trapezoids, sectors) are converted to polygon approximations
2. The solver feeds polygons into the Fit packer, which uses a genetic algorithm (GA) to evolve placement orderings
3. For each candidate ordering, the packer computes No-Fit Polygons to find valid placements where parts don't overlap
4. The GA optimizes for minimal bounding area (i.e., least material used)
5. Results include per-part placements with position, rotation, and overall utilization percentage

## Files

- **types.ts** -- Core type definitions: Point2D, Polygon2D, NestingPart, NestingInput, Placement2D, NestingResult

```typescript
export interface Point2D { x: number; y: number }

export interface Polygon2D {
  id: string
  points: Point2D[]
  rotationSteps?: number  // 4 = 0/90/180/270
}

export interface NestingPart {
  id: string
  polygon: Polygon2D
  quantity: number
  renderShape: "rect" | "circle" | "trapezoid" | "sector"
  originalSpec: Record<string, unknown>
}

export interface NestingInput {
  binWidth: number; binHeight: number
  parts: NestingPart[]
  spacing: number; rotationSteps: number
  populationSize?: number; mutationRate?: number; generations?: number; seed?: number
}

export interface Placement2D {
  partId: string; x: number; y: number; width: number; height: number
  polygonArea: number; rotation: number; placedPolygon: Point2D[]; flipped: boolean
}

export interface NestingResult {
  placements: Placement2D[]; placed: number; overflow: number
  usedArea: number; occupiedArea: number; stockArea: number; wasteArea: number
  efficiency: number  // 0-100
  source: "heuristic" | "optimized"
}
```
- **shape-to-polygon.ts** -- Converts geometric shapes (rect, circle, trapezoid, annular sector) to polygon vertex arrays

```typescript
export function rectToPolygon(width: number, height: number): Point2D[] {
  return [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }]
}

export function circleToPolygon(diameter: number, segments = 24): Point2D[] {
  const r = diameter / 2
  return Array.from({ length: segments }, (_, i) => {
    const angle = (2 * Math.PI * i) / segments
    return { x: r + r * Math.cos(angle), y: r + r * Math.sin(angle) }
  })
}

export function trapezoidToPolygon(topWidth: number, bottomWidth: number, height: number): Point2D[] {
  const maxW = Math.max(topWidth, bottomWidth)
  const topInset = (maxW - topWidth) / 2
  const botInset = (maxW - bottomWidth) / 2
  return [{ x: topInset, y: 0 }, { x: maxW - topInset, y: 0 }, { x: maxW - botInset, y: height }, { x: botInset, y: height }]
}

export function sectorToPolygon(innerRadius: number, outerRadius: number, arcDegrees: number, segments = 16): Point2D[] {
  // Traces outer arc (forward) then inner arc (reverse) to form annular sector polygon
  // ...
}
```
- **nfp-solver.ts** -- NFPSolver class that runs the Fit packer, converts packing events to NestingResult format

```typescript
export class NFPSolver {
  private currentJobId = 0
  private cancelled = false
  private currentPacker: InstanceType<typeof Packer> | null = null

  solve(
    input: NestingInput,
    callbacks: {
      onProgress?: (result: NestingResult) => void
      onComplete: (result: NestingResult) => void
      onError?: (message: string) => void
    }
  ): () => void {
    // Dynamically imports the vendor Fit packer to avoid bundling issues
    // Creates Bin and Part instances from NestingInput
    // Runs the GA-based packer with onPacking/onPackingCompleted events
    // Converts PackingEvent placements to NestingResult format
    // Returns a cancel function: () => this.cancel()
  }

  cancel(): void {
    this.cancelled = true
    this.currentPacker?.stop()
  }
}

// Usage:
// const solver = new NFPSolver()
// const cancel = solver.solve(input, { onComplete: (result) => setResult(result) })
// cancel() // to abort
```

## vendor/fit/

Third-party nesting library (vendored). Implements the core NFP packing algorithm with a genetic algorithm optimizer.

- **index.ts** -- Library entry point
- **packer.ts** -- Main packing orchestrator
- **placer.ts** -- Places parts using NFP calculations
- **placement.ts** -- Placement data structures
- **part.ts** -- Part representation for the packer
- **bin.ts** -- Bin (stock material) representation
- **polygon.ts** -- Polygon operations (NFP computation, intersection, containment)
- **bounding-box.ts** -- Axis-aligned bounding box calculations
- **ga/ga.ts** -- Genetic algorithm driver
- **ga/dna.ts** -- DNA encoding for part orderings/rotations
- **gaussian.ts** -- Gaussian distribution for GA mutation
- **xorshift.ts** -- Fast PRNG for the GA
- **vector.ts** / **indexed-vector.ts** -- 2D vector math
- **util-geometry.ts** / **util.ts** -- Geometry and general utilities
- **clipper-lib.d.ts** -- Type declarations for the Clipper polygon clipping library
