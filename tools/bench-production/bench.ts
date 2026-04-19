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
import type { PackRequest, Part } from "../../src/application/packing/types"
import { RustPackingService } from "../../src/infrastructure/services/rustPackingService"
import { LegacyPackingService } from "../../src/infrastructure/services/legacyPackingService"

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

  const [rust, legacy] = [rustRun.result, legacyRun.result]

  console.log("\n=== Results\n")
  console.log("| Metric | Rust | Legacy | Δ |")
  console.log("|---|---:|---:|---:|")
  console.log(`| Placed | ${rust.placedCount} | ${legacy.placedCount} | ${rust.placedCount - legacy.placedCount} |`)
  console.log(`| Overflow | ${rust.overflowCount} | ${legacy.overflowCount} | ${rust.overflowCount - legacy.overflowCount} |`)
  console.log(`| Total used area | ${rust.totalUsedArea.toFixed(1)} | ${legacy.totalUsedArea.toFixed(1)} | ${(rust.totalUsedArea - legacy.totalUsedArea).toFixed(1)} |`)
  console.log(`| Total waste area | ${rust.totalWasteArea.toFixed(1)} | ${legacy.totalWasteArea.toFixed(1)} | ${(rust.totalWasteArea - legacy.totalWasteArea).toFixed(1)} |`)
  const rustDensity = rust.totalUsedArea / (rust.totalUsedArea + rust.totalWasteArea || 1)
  const legacyDensity = legacy.totalUsedArea / (legacy.totalUsedArea + legacy.totalWasteArea || 1)
  console.log(`| Overall density | ${(rustDensity * 100).toFixed(2)}% | ${(legacyDensity * 100).toFixed(2)}% | ${((rustDensity - legacyDensity) * 100).toFixed(2)}% |`)
  console.log(`| Wall-clock (ms) | ${rustRun.elapsedMs} | ${legacyRun.elapsedMs} | ${rustRun.elapsedMs - legacyRun.elapsedMs} |`)

  console.log("\n=== Per-bin breakdown\n")
  console.log("| Bin | Rust placed | Legacy placed | Rust efficiency | Legacy efficiency |")
  console.log("|---|---:|---:|---:|---:|")
  for (let i = 0; i < opts.nBins; i++) {
    const rustBin = rust.perBin[i]
    const legBin = legacy.perBin[i]
    const rustPlaced = rust.placements.filter((p) => p.binId === rustBin?.binId).length
    const legPlaced = legacy.placements.filter((p) => p.binId === legBin?.binId).length
    console.log(
      `| ${rustBin?.binId ?? `roll-${i + 1}`} | ${rustPlaced} | ${legPlaced} | ${((rustBin?.efficiency ?? 0) * 100).toFixed(2)}% | ${((legBin?.efficiency ?? 0) * 100).toFixed(2)}% |`
    )
  }

  console.log("\n=== Bottom line\n")
  if (rust.placedCount > legacy.placedCount) {
    const savedPieces = rust.placedCount - legacy.placedCount
    console.log(`Rust placed ${savedPieces} more piece(s) than legacy.`)
  } else if (rust.placedCount < legacy.placedCount) {
    console.log(`Legacy placed ${legacy.placedCount - rust.placedCount} more piece(s) than Rust — investigate.`)
  } else {
    console.log("Both engines placed the same number of pieces.")
  }
  if (rustDensity > legacyDensity) {
    console.log(`Rust density ${((rustDensity - legacyDensity) * 100).toFixed(2)}% higher than legacy.`)
  } else if (rustDensity < legacyDensity) {
    console.log(`Legacy density ${((legacyDensity - rustDensity) * 100).toFixed(2)}% higher than Rust.`)
  } else {
    console.log("Both engines hit equivalent density.")
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
