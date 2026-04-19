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
} from "@/src/application/packing/types"
import { greedyNfpPack } from "@/nesting/nfp-greedy-placer"
import { NFPSolver } from "@/nesting/nfp-solver"
import type { NestingInput, NestingResult, NestingPart, Polygon2D } from "@/nesting/types"

@injectable()
export class LegacyPackingService implements IPackingService {
  async pack(
    request: PackRequest,
    onProgress?: (progress: PackProgress) => void
  ): Promise<PackResult> {
    validateRequest(request)
    const jobId = cryptoRandomId()
    const startedAtMs = Date.now()

    const accumulatedPlacements: Placement[] = []
    const perBin: BinResult[] = []
    const indexCounters = new Map<string, number>()
    // Deep-copy items for overflow bookkeeping (decrement quantity per bin pass)
    let remaining: Part[] = request.items.map((i) => ({ ...i }))

    for (const bin of request.bins) {
      if (remaining.every((r) => r.quantity === 0)) break

      const singleBinReq: PackRequest = {
        ...request,
        bins: [bin],
        items: remaining,
      }
      const sub = isHomogeneous(remaining)
        ? await this.packHomogeneous(singleBinReq, jobId, undefined)
        : await this.packMixedWithGA(singleBinReq, jobId, undefined)

      for (const p of sub.placements) {
        const idx = indexCounters.get(p.shapeId) ?? 0
        indexCounters.set(p.shapeId, idx + 1)
        accumulatedPlacements.push({ ...p, instanceIndex: idx })
      }
      perBin.push(sub.perBin[0])

      // Subtract placed count per shape from remaining
      const placedByShape = new Map<string, number>()
      for (const p of sub.placements) {
        placedByShape.set(p.shapeId, (placedByShape.get(p.shapeId) ?? 0) + 1)
      }
      remaining = remaining
        .map((r) => ({
          ...r,
          quantity: r.quantity - (placedByShape.get(r.shapeId) ?? 0),
        }))
        .filter((r) => r.quantity > 0)
    }

    const totalUsedArea = perBin.reduce((s, b) => s + b.usedArea, 0)
    const totalWasteArea = perBin.reduce((s, b) => s + b.wasteArea, 0)
    const overflowCount = remaining.reduce((s, r) => s + r.quantity, 0)

    const result: PackResult = {
      placements: accumulatedPlacements,
      placedCount: accumulatedPlacements.length,
      overflowCount,
      perBin,
      totalUsedArea,
      totalWasteArea,
    }

    onProgress?.({
      iteration: 1,
      elapsedMs: Date.now() - startedAtMs,
      bestPlacedCount: result.placedCount,
      bestActiveStockDensity:
        result.totalUsedArea + result.totalWasteArea > 0
          ? result.totalUsedArea / (result.totalUsedArea + result.totalWasteArea)
          : 0,
      phase: "explore",
    })

    return result
  }

  async cancel(_jobId: string): Promise<void> {
    // No-op: legacy sync engines (greedy NFP, GA) cannot be cancelled cooperatively.
    // Task 14/15 add real cooperative cancellation when multi-bin + mixed-GA lands.
  }

  private async packHomogeneous(
    request: PackRequest,
    jobId: string,
    onProgress?: (p: PackProgress) => void
  ): Promise<PackResult> {
    const [part] = request.items
    const bin = request.bins[0]
    const poly: Polygon2D = { id: part.shapeId, points: part.polygon }
    const startedAtMs = Date.now()
    let legacy
    try {
      legacy = greedyNfpPack(
        poly,
        bin.width,
        bin.height,
        part.quantity,
        request.clearance,
        part.allowRotation ? 4 : 1
      )
    } catch (e) {
      throw new Error(
        `LegacyPackingService.packHomogeneous: greedyNfpPack failed for shapeId=${part.shapeId} on binId=${bin.binId}: ${(e as Error).message}`
      )
    }

    const counters = new Map<string, number>()
    const placements: Placement[] = legacy.placements.map((p) => {
      const idx = counters.get(part.shapeId) ?? 0
      counters.set(part.shapeId, idx + 1)
      return {
        shapeId: part.shapeId,
        instanceIndex: idx,
        binId: bin.binId,
        x: p.x,
        y: p.y,
        rotationRad: p.rotation,
        polygon: p.placedPolygon,
        width: p.width,
        height: p.height,
      }
    })

    const usedArea = legacy.usedArea
    const stockArea = bin.width * bin.height
    const perBin: BinResult[] = [
      {
        binId: bin.binId,
        usedArea,
        wasteArea: stockArea - usedArea,
        occupiedWidth: legacy.occupiedWidth > 0 ? legacy.occupiedWidth : bin.width,
        occupiedHeight: legacy.occupiedHeight > 0 ? legacy.occupiedHeight : bin.height,
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
      iteration: 1,
      elapsedMs: Date.now() - startedAtMs,
      bestPlacedCount: result.placedCount,
      bestActiveStockDensity:
        result.totalUsedArea + result.totalWasteArea > 0
          ? result.totalUsedArea / (result.totalUsedArea + result.totalWasteArea)
          : 0,
      phase: "explore",
    })

    return result
  }

  private async packMixedWithGA(
    request: PackRequest,
    jobId: string,
    onProgress?: (p: PackProgress) => void
  ): Promise<PackResult> {
    const startedAtMs = Date.now()
    const bin = request.bins[0]
    const parts: NestingPart[] = request.items.map((p) => ({
      id: p.shapeId,
      polygon: { id: p.shapeId, points: p.polygon },
      quantity: p.quantity,
      renderShape: "rect",
      originalSpec: {},
    }))
    const rotationSteps = request.items.every((p) => p.allowRotation) ? 4 : 1
    const input: NestingInput = {
      binWidth: bin.width,
      binHeight: bin.height,
      parts,
      spacing: request.clearance,
      rotationSteps,
      generations: 12,
      populationSize: 6,
      mutationRate: 0.2,
      seed: request.seed,
    }
    const solver = new NFPSolver()
    let legacy: NestingResult
    try {
      legacy = await new Promise<NestingResult>((resolve, reject) => {
        solver.solve(input, {
          onComplete: resolve,
          onError: (msg) => reject(new Error(msg)),
        })
      })
    } catch (e) {
      throw new Error(
        `LegacyPackingService.packMixedWithGA: NFPSolver failed on binId=${bin.binId}: ${(e as Error).message}`
      )
    }

    const counters = new Map<string, number>()
    const placements: Placement[] = legacy.placements.map((p) => {
      const shapeId = p.partId.replace(/-\d+$/, "")
      const idx = counters.get(shapeId) ?? 0
      counters.set(shapeId, idx + 1)
      return {
        shapeId,
        instanceIndex: idx,
        binId: bin.binId,
        x: p.x,
        y: p.y,
        rotationRad: p.rotation,
        polygon: p.placedPolygon,
        width: p.width,
        height: p.height,
      }
    })

    const usedArea = legacy.usedArea
    const stockArea = bin.width * bin.height
    const perBin: BinResult[] = [
      {
        binId: bin.binId,
        usedArea,
        wasteArea: stockArea - usedArea,
        occupiedWidth: legacy.occupiedWidth > 0 ? legacy.occupiedWidth : bin.width,
        occupiedHeight: legacy.occupiedHeight > 0 ? legacy.occupiedHeight : bin.height,
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
      iteration: 1,
      elapsedMs: Date.now() - startedAtMs,
      bestPlacedCount: result.placedCount,
      bestActiveStockDensity:
        result.totalUsedArea + result.totalWasteArea > 0
          ? result.totalUsedArea / (result.totalUsedArea + result.totalWasteArea)
          : 0,
      phase: "explore",
    })

    return result
  }
}

function validateRequest(req: PackRequest): void {
  if (req.bins.length === 0) throw new Error("pack: bins required")
  if (req.items.length === 0) throw new Error("pack: items required")
}

// TODO(S2): Recognize true homogeneity by (shapeId, allowRotation, grainAxis) identity —
// today items.length === 1 under-routes truly identical parts split across entries.
function isHomogeneous(items: Part[]): boolean {
  return items.length === 1
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `job-${Math.random().toString(36).slice(2)}`
}
