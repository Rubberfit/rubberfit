#!/usr/bin/env -S npx tsx
// Benchmark harness: real production cut lists vs both engines.
//
// Usage:
//   npx tsx tools/bench-production/bench.ts <cuts.csv> [--bin WxL] [--bins N] [--rotation true|false] [--clearance c]
//
// CSV format:
//   Quantity,R&S Part Number,Length (in),Width (in)
//   3,G1,120.75,35.5
//   ...
//
// Runs both the Rust engine (release binary) and the legacy TS engine on
// the same PackRequest, reports density / placed / elapsed_ms side-by-side.

import "reflect-metadata"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { PackRequest, PackResult, Part, Placement } from "../../src/application/packing/types"
import { RustPackingService } from "../../src/infrastructure/services/rustPackingService"
import { LegacyPackingService } from "../../src/infrastructure/services/legacyPackingService"
import { extractMaximalFreeRects, classifyFreeRegion } from "../../nesting/free-space"

type CliOpts = {
  csv: string
  binW: number
  binL: number
  nBins: number
  rotation: boolean
  clearance: number
  seed: number
}

function parseArgs(argv: string[]): CliOpts {
  if (argv.length < 3) {
    console.error(
      "usage: npx tsx tools/bench-production/bench.ts <cuts.csv> [--bin WxL] [--bins N] [--rotation true|false] [--clearance c]"
    )
    process.exit(1)
  }
  const opts: CliOpts = {
    csv: resolve(argv[2]),
    binW: 78,
    binL: 396,
    nBins: 2,
    rotation: true,
    clearance: 0,
    seed: 42,
  }
  for (let i = 3; i < argv.length; i++) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (flag === "--bin" && value) {
      const [w, l] = value.split("x").map(Number)
      opts.binW = w
      opts.binL = l
      i++
    } else if (flag === "--bins" && value) {
      opts.nBins = Number(value)
      i++
    } else if (flag === "--rotation" && value) {
      opts.rotation = value === "true"
      i++
    } else if (flag === "--clearance" && value) {
      opts.clearance = Number(value)
      i++
    }
  }
  return opts
}

type CsvRow = {
  quantity: number
  shapeId: string
  length: number
  width: number
}

function parseCsv(path: string): CsvRow[] {
  const content = readFileSync(path, "utf-8")
  const lines = content.trim().split(/\r?\n/)
  const rows: CsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",")
    if (cells.length < 4) continue
    rows.push({
      quantity: Number(cells[0]),
      shapeId: cells[1].trim(),
      length: Number(cells[2]),
      width: Number(cells[3]),
    })
  }
  return rows
}

function buildPackRequest(rows: CsvRow[], opts: CliOpts): PackRequest {
  // Fabric-roll convention: part's Length dimension runs ALONG the roll
  // length (bin.height), Width runs ACROSS the roll (bin.width). So
  // x = Width, y = Length.
  const items: Part[] = rows.map((r) => ({
    shapeId: r.shapeId,
    quantity: r.quantity,
    polygon: [
      { x: 0, y: 0 },
      { x: r.width, y: 0 },
      { x: r.width, y: r.length },
      { x: 0, y: r.length },
    ],
    allowRotation: opts.rotation,
  }))
  const bins = Array.from({ length: opts.nBins }, (_, idx) => ({
    binId: `roll-${idx + 1}`,
    width: opts.binW,
    height: opts.binL,
    kind: "fresh" as const,
  }))
  return {
    bins,
    clearance: opts.clearance,
    items,
    mode: "balanced",
    timeBudgetMs: 10_000,
    seed: opts.seed,
    units: "inch",
  } as PackRequest
}

function totalRequested(rows: CsvRow[]): number {
  return rows.reduce((s, r) => s + r.quantity, 0)
}

function totalArea(rows: CsvRow[]): number {
  return rows.reduce((s, r) => s + r.quantity * r.length * r.width, 0)
}

async function runRust(request: PackRequest) {
  const t0 = Date.now()
  const result = await new RustPackingService().pack(request)
  return { result, elapsedMs: Date.now() - t0 }
}

async function runLegacy(request: PackRequest) {
  const t0 = Date.now()
  const result = await new LegacyPackingService().pack(request)
  return { result, elapsedMs: Date.now() - t0 }
}

/**
 * Per-bin remnant analysis. Mirrors legacy's reusable/scrap extraction
 * (nesting/free-space.ts) so Rust vs legacy can be compared on the same
 * metrics. Returns per-bin metrics and totals.
 */
interface BinRemnant {
  binId: string
  stockArea: number
  usedArea: number
  wasteArea: number
  reusableArea: number
  scrapArea: number
  occupiedHeight: number
  tailRemnantHeight: number
  reusableRects: number
}

interface EngineMetrics {
  placed: number
  overflow: number
  totalStock: number
  totalUsed: number
  totalWaste: number
  totalReusable: number
  totalScrap: number
  perBin: BinRemnant[]
  elapsedMs: number
  fabScore: number
  fabBreakdown: { waste: number; reusable: number; seam: number; nesting: number }
}

function analyseResult(
  result: PackResult,
  bins: { binId: string; width: number; height: number }[],
  elapsedMs: number
): EngineMetrics {
  const perBin: BinRemnant[] = []
  let totalReusable = 0
  let totalScrap = 0
  let totalOccupiedArea = 0

  for (const bin of bins) {
    const binResult = result.perBin.find((b) => b.binId === bin.binId)
    const placements = result.placements.filter((p) => p.binId === bin.binId)
    const placedPolygons = placements.map((p: Placement) => p.polygon)
    const stockArea = bin.width * bin.height
    const usedArea = binResult?.usedArea ?? 0
    const wasteArea = binResult?.wasteArea ?? stockArea

    let occupiedHeight = 0
    for (const p of placements) {
      for (const pt of p.polygon) {
        if (pt.y > occupiedHeight) occupiedHeight = pt.y
      }
    }
    const tailRemnantHeight = Math.max(0, bin.height - occupiedHeight)

    let reusableArea = 0
    let scrapArea = 0
    let reusableRects = 0
    if (placedPolygons.length > 0) {
      const freeRegions = extractMaximalFreeRects(
        bin.width,
        bin.height,
        placedPolygons,
        10
      )
      for (const region of freeRegions) {
        const cls = classifyFreeRegion(region)
        if (cls === "reusable") {
          reusableArea += region.area
          reusableRects += 1
        } else {
          scrapArea += region.area
        }
      }
    } else {
      // Empty bin — whole stock is reusable.
      reusableArea = stockArea
    }

    totalReusable += reusableArea
    totalScrap += scrapArea
    totalOccupiedArea += occupiedHeight * bin.width

    perBin.push({
      binId: bin.binId,
      stockArea,
      usedArea,
      wasteArea,
      reusableArea,
      scrapArea,
      occupiedHeight,
      tailRemnantHeight,
      reusableRects,
    })
  }

  const totalStock = perBin.reduce((s, b) => s + b.stockArea, 0)
  const totalUsed = perBin.reduce((s, b) => s + b.usedArea, 0)
  const totalWaste = perBin.reduce((s, b) => s + b.wasteArea, 0)

  // Fab Score per legacy formula (nesting-preview-builders.ts:260).
  // 40% waste + 20% reusable + 20% seam + 20% nesting efficiency.
  // Seam component uses pieces-per-unit from the first placed group;
  // for multi-bin we approximate with placed/bins.
  const rollArea = totalStock
  const wastePct = rollArea > 0 ? (totalWaste / rollArea) * 100 : 100
  const wasteScore = Math.max(0, 100 - wastePct * 2)
  const reusablePct = totalWaste > 0 ? (totalReusable / totalWaste) * 100 : 0
  const reusableScore = Math.min(100, reusablePct)
  const seams = Math.max(1, Math.round(result.placedCount / Math.max(1, bins.length)))
  const seamScore =
    seams <= 1 ? 100 : seams <= 2 ? 85 : seams <= 4 ? 60 : Math.max(0, 100 - seams * 8)
  const nestingEff =
    totalOccupiedArea > 0 ? (totalUsed / totalOccupiedArea) * 100 : 0
  const nestingScore = Math.min(100, nestingEff)
  const fabScore = Math.round(
    wasteScore * 0.4 + reusableScore * 0.2 + seamScore * 0.2 + nestingScore * 0.2
  )

  return {
    placed: result.placedCount,
    overflow: result.overflowCount,
    totalStock,
    totalUsed,
    totalWaste,
    totalReusable,
    totalScrap,
    perBin,
    elapsedMs,
    fabScore,
    fabBreakdown: {
      waste: Math.round(wasteScore),
      reusable: Math.round(reusableScore),
      seam: Math.round(seamScore),
      nesting: Math.round(nestingScore),
    },
  }
}

async function main() {
  const opts = parseArgs(process.argv)
  const rows = parseCsv(opts.csv)

  console.log(`\n=== Benchmark: ${opts.csv}\n`)
  console.log(`Input:`)
  console.log(`  - ${rows.length} unique parts, ${totalRequested(rows)} total copies`)
  console.log(`  - total part area: ${totalArea(rows).toFixed(1)} sq in`)
  console.log(`  - stock: ${opts.nBins} × ${opts.binW} × ${opts.binL} = ${(opts.nBins * opts.binW * opts.binL).toFixed(1)} sq in`)
  console.log(`  - theoretical max density: ${((totalArea(rows) / (opts.nBins * opts.binW * opts.binL)) * 100).toFixed(1)}%`)
  console.log(`  - rotation: ${opts.rotation}, clearance: ${opts.clearance}, seed: ${opts.seed}\n`)

  const request = buildPackRequest(rows, opts)

  console.log("Running Rust engine...")
  const rustRun = await runRust(request)
  console.log("Running legacy TS engine...")
  const legacyRun = await runLegacy(request)

  const benchBins = request.bins.map((b) => ({
    binId: b.binId,
    width: b.width,
    height: b.height,
  }))

  const rust = analyseResult(rustRun.result, benchBins, rustRun.elapsedMs)
  const legacy = analyseResult(legacyRun.result, benchBins, legacyRun.elapsedMs)

  console.log("\n=== Headline metrics\n")
  console.log("| Metric | Rust | Legacy | Δ |")
  console.log("|---|---:|---:|---:|")
  console.log(`| Placed / Overflow | ${rust.placed}/${rust.overflow} | ${legacy.placed}/${legacy.overflow} | ${rust.placed - legacy.placed} |`)
  console.log(`| Used area (sq in) | ${rust.totalUsed.toFixed(1)} | ${legacy.totalUsed.toFixed(1)} | ${(rust.totalUsed - legacy.totalUsed).toFixed(1)} |`)
  const rustDensity = rust.totalUsed / rust.totalStock
  const legacyDensity = legacy.totalUsed / legacy.totalStock
  console.log(`| Density | ${(rustDensity * 100).toFixed(2)}% | ${(legacyDensity * 100).toFixed(2)}% | ${((rustDensity - legacyDensity) * 100).toFixed(2)}% |`)
  console.log(`| Reusable area (sq in) | ${rust.totalReusable.toFixed(1)} | ${legacy.totalReusable.toFixed(1)} | ${(rust.totalReusable - legacy.totalReusable).toFixed(1)} |`)
  console.log(`| Scrap area (sq in) | ${rust.totalScrap.toFixed(1)} | ${legacy.totalScrap.toFixed(1)} | ${(rust.totalScrap - legacy.totalScrap).toFixed(1)} |`)
  const rustReusablePct = rust.totalWaste > 0 ? (rust.totalReusable / rust.totalWaste) * 100 : 0
  const legacyReusablePct = legacy.totalWaste > 0 ? (legacy.totalReusable / legacy.totalWaste) * 100 : 0
  console.log(`| Reusable / waste | ${rustReusablePct.toFixed(1)}% | ${legacyReusablePct.toFixed(1)}% | ${(rustReusablePct - legacyReusablePct).toFixed(1)}% |`)
  console.log(`| Fab Score | ${rust.fabScore}/100 | ${legacy.fabScore}/100 | ${rust.fabScore - legacy.fabScore} |`)
  console.log(`| Wall-clock (ms) | ${rust.elapsedMs} | ${legacy.elapsedMs} | ${rust.elapsedMs - legacy.elapsedMs} |`)

  console.log("\n=== Fab Score breakdown (Rust / Legacy)\n")
  console.log("| Component | Rust | Legacy |")
  console.log("|---|---:|---:|")
  console.log(`| Waste (40%) | ${rust.fabBreakdown.waste} | ${legacy.fabBreakdown.waste} |`)
  console.log(`| Reusable (20%) | ${rust.fabBreakdown.reusable} | ${legacy.fabBreakdown.reusable} |`)
  console.log(`| Seam (20%) | ${rust.fabBreakdown.seam} | ${legacy.fabBreakdown.seam} |`)
  console.log(`| Nesting (20%) | ${rust.fabBreakdown.nesting} | ${legacy.fabBreakdown.nesting} |`)

  console.log("\n=== Per-bin remnant analysis\n")
  console.log("| Bin | Engine | Placed | Occ.Height | Tail | Reusable | Scrap | #Reusable rects |")
  console.log("|---|---|---:|---:|---:|---:|---:|---:|")
  for (let i = 0; i < opts.nBins; i++) {
    const rustBin = rust.perBin[i]
    const legBin = legacy.perBin[i]
    const rustPlaced = rustRun.result.placements.filter((p) => p.binId === rustBin?.binId).length
    const legPlaced = legacyRun.result.placements.filter((p) => p.binId === legBin?.binId).length
    console.log(
      `| ${rustBin?.binId} | Rust | ${rustPlaced} | ${rustBin?.occupiedHeight.toFixed(2)} | ${rustBin?.tailRemnantHeight.toFixed(2)} | ${rustBin?.reusableArea.toFixed(0)} | ${rustBin?.scrapArea.toFixed(0)} | ${rustBin?.reusableRects} |`
    )
    console.log(
      `| ${legBin?.binId} | Legacy | ${legPlaced} | ${legBin?.occupiedHeight.toFixed(2)} | ${legBin?.tailRemnantHeight.toFixed(2)} | ${legBin?.reusableArea.toFixed(0)} | ${legBin?.scrapArea.toFixed(0)} | ${legBin?.reusableRects} |`
    )
  }

  console.log("\n=== Bottom line\n")
  const maxTailRust = Math.max(...rust.perBin.map((b) => b.tailRemnantHeight))
  const maxTailLegacy = Math.max(...legacy.perBin.map((b) => b.tailRemnantHeight))
  if (rust.placed > legacy.placed) {
    console.log(`✓ Rust placed ${rust.placed - legacy.placed} more piece(s) than legacy.`)
  } else if (rust.placed < legacy.placed) {
    console.log(`✗ Legacy placed ${legacy.placed - rust.placed} more piece(s) than Rust.`)
  } else {
    console.log(`= Placement count tied (${rust.placed} pieces each).`)
  }
  const remnantDelta = rust.totalReusable - legacy.totalReusable
  if (Math.abs(remnantDelta) < 1) {
    console.log(`= Reusable area tied (Δ ${remnantDelta.toFixed(1)} sq in).`)
  } else if (remnantDelta > 0) {
    console.log(`✓ Rust has ${remnantDelta.toFixed(0)} sq in more reusable remnant (${((remnantDelta / legacy.totalReusable) * 100).toFixed(1)}% improvement).`)
  } else {
    console.log(`✗ Legacy has ${(-remnantDelta).toFixed(0)} sq in more reusable remnant (${((-remnantDelta / rust.totalReusable) * 100).toFixed(1)}% worse).`)
  }
  const tailDelta = maxTailRust - maxTailLegacy
  if (Math.abs(tailDelta) < 0.1) {
    console.log(`= Max tail-remnant height tied (${maxTailRust.toFixed(2)}" each).`)
  } else if (tailDelta > 0) {
    console.log(`✓ Rust has longer tail remnant by ${tailDelta.toFixed(2)}" (${maxTailRust.toFixed(2)} vs ${maxTailLegacy.toFixed(2)}).`)
  } else {
    console.log(`✗ Legacy has longer tail remnant by ${(-tailDelta).toFixed(2)}" (${maxTailLegacy.toFixed(2)} vs ${maxTailRust.toFixed(2)}).`)
  }
  if (rust.fabScore > legacy.fabScore) {
    console.log(`✓ Rust Fab Score higher by ${rust.fabScore - legacy.fabScore} pts.`)
  } else if (rust.fabScore < legacy.fabScore) {
    console.log(`✗ Legacy Fab Score higher by ${legacy.fabScore - rust.fabScore} pts.`)
  } else {
    console.log(`= Fab Scores tied at ${rust.fabScore}/100.`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
