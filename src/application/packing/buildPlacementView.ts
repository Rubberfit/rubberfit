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
