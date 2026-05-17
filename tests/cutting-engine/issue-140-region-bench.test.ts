/**
 * Perf budget bench for `computeAdaptiveRegions` in the Free-roam canvas
 * (issue #140 / ARC-91 — main-thread stall when adding shapes).
 *
 * Locks the per-tick compute budget for the production drag path
 * (`skipPocketPass: true`) and the on-drop full-pipeline path. Trace
 * evidence (docs/superpowers/benchmarks/2026-05-01-arc-91-trace.md)
 * confirmed compute was never the dominant ARC-91 cost — the residual
 * cost was React commit fanout, addressed by Fix C-4. These budgets
 * prevent compute regression sliding back into the problem space.
 *
 * Budgets:
 *   - drag-frame compute (skipPocketPass): under 8ms p95 at N=10
 *   - drop-frame compute (full pipeline):  under 50ms max at N=10
 *   - drag-frame compute at N=20 scaling:  under 16ms p95
 */
/**
 * TODO(arc-91 unskip): When this suite is unskipped after the perf fix
 * lands (plan Task 7), revisit these bench-hygiene items:
 *
 *   - Drop-frame test (N=10, full pipeline) currently uses N=5 samples
 *     with no warm-up and a Math.max assertion. Either bump to >=10
 *     samples + p95, or add 1-2 warm-up iterations and document the
 *     "no warm-up = cold-cache worst case" intent inline. As written
 *     it is the most flake-prone shape on shared CI hardware.
 *   - p95 at N=30 only excludes the single worst sample. For reliable
 *     CI behaviour bump samples to >=100 or fall back to median / p90
 *     at N=30.
 *   - Drag bodies (Case 1 + Case 3) duplicate ~90% of their logic.
 *     Collapse to `it.each([{ n: 10, budget: 8 }, { n: 20, budget: 16 }])`
 *     or a `runDragBench(n, budgetMs)` helper before unskipping.
 *   - Test names embed literal thresholds ("under 8ms p95 at N=10").
 *     If the budget is retuned the title goes stale. Strip thresholds
 *     from titles ("drag-frame compute (N=10, skipPocketPass) within
 *     p95 budget") and let the assertion failure surface the number.
 *   - STOCK.length = 192 here vs 48 in issue-117 fixtures — chosen to
 *     fit 20 placements at 14" pitch without collision. Add inline
 *     comment so future readers don't assume copy-paste drift.
 *   - Displacement loop uses `i * 0.1` (max 2.9" at i=29). Stays
 *     in-stock and non-colliding only because of the specific seed in
 *     makePlacements. Add `Math.min(p.x + i * 0.1, STOCK.width - 12)`
 *     clamp or document the bound so a future seed change doesn't
 *     silently push the moved placement off-stock.
 */
import { describe, expect, it } from "vitest"
import { computeAdaptiveRegions } from "@/app/dashboard/cutting-engine/_components/manual-layout/regions"
import { makeRegionCache } from "@/app/dashboard/cutting-engine/_components/manual-layout/region-cache"
import type { ManualPlacement } from "@/app/dashboard/cutting-engine/_components/manual-layout/collision"
import type { PartTemplate } from "@/app/dashboard/cutting-engine/_components/preset-template-data"
import type { StockConfig } from "@/app/dashboard/cutting-engine/_components/stock-preview-configurator"

const STOCK: StockConfig = { width: 96, length: 192, thickness: 0.06, material: "EPDM", kerf: 0.125 }

function rectTemplate(id: string, width: number, length: number): PartTemplate {
  return {
    id,
    partType: "rectangle",
    label: id,
    summary: `${width}x${length}`,
    quantity: 1,
    category: "custom",
    width,
    length,
  }
}

const RECT: PartTemplate = rectTemplate("rect-12x12", 12, 12)

function makePlacements(n: number): ManualPlacement[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p-${i}`,
    templateId: RECT.id,
    x: 4 + (i % 6) * 14,
    y: 4 + Math.floor(i / 6) * 14,
    rotationRad: 0,
  }))
}

function p95(samples: number[]): number {
  if (samples.length === 0) throw new Error("p95: empty samples array")
  const sorted = [...samples].sort((a, b) => a - b)
  const value = sorted[Math.floor(sorted.length * 0.95)]
  if (value === undefined) throw new Error("p95: index out of range")
  return value
}

describe("ARC-91 / issue #140 — region perf budget", () => {
  it("drag-frame compute stays under 8ms p95 at N=10 with cache (skipPocketPass)", () => {
    const cache = makeRegionCache()
    const placements = makePlacements(10)
    for (let i = 0; i < 3; i++) {
      computeAdaptiveRegions(placements, [RECT], STOCK, cache, { skipPocketPass: true })
    }
    const samples: number[] = []
    for (let i = 0; i < 30; i++) {
      const moving = placements.map((p, idx) => (idx === 0 ? { ...p, x: p.x + i * 0.1 } : p))
      const t0 = performance.now()
      computeAdaptiveRegions(moving, [RECT], STOCK, cache, { skipPocketPass: true })
      samples.push(performance.now() - t0)
    }
    expect(p95(samples)).toBeLessThan(8)
  })

  it("drop-frame compute stays under 50ms at N=10 (full pipeline)", () => {
    const cache = makeRegionCache()
    const placements = makePlacements(10)
    const samples: number[] = []
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now()
      computeAdaptiveRegions(placements, [RECT], STOCK, cache)
      samples.push(performance.now() - t0)
    }
    expect(Math.max(...samples)).toBeLessThan(50)
  })

  it("scales to N=20 within 16ms p95 on drag (skipPocketPass)", () => {
    const cache = makeRegionCache()
    const placements = makePlacements(20)
    for (let i = 0; i < 3; i++) {
      computeAdaptiveRegions(placements, [RECT], STOCK, cache, { skipPocketPass: true })
    }
    const samples: number[] = []
    for (let i = 0; i < 30; i++) {
      const moving = placements.map((p, idx) => (idx === 0 ? { ...p, x: p.x + i * 0.1 } : p))
      const t0 = performance.now()
      computeAdaptiveRegions(moving, [RECT], STOCK, cache, { skipPocketPass: true })
      samples.push(performance.now() - t0)
    }
    expect(p95(samples)).toBeLessThan(16)
  })
})
