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
