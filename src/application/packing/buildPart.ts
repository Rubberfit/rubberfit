import type { Part, ShapeSpec, Point2D } from "@/src/application/packing/types"

export interface BuildPartInput {
  shapeId: string
  quantity: number
  shapeSpec?: ShapeSpec
  allowRotation: boolean
  grainAxis?: "width" | "length" | "none"
  difficulty?: number
  polygon?: Point2D[]
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

function buildRect(width: number, height: number): Point2D[] {
  if (!(width > 0)) throw new Error("rect: width must be positive")
  if (!(height > 0)) throw new Error("rect: height must be positive")
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ]
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

function buildCircle(diameter: number, segments: number): Point2D[] {
  if (!(diameter > 0)) throw new Error("circle: diameter must be positive")
  if (!(segments >= 8)) throw new Error("circle: segments must be at least 8")
  const r = diameter / 2
  const pts: Point2D[] = []
  for (let i = 0; i < segments; i++) {
    const theta = (2 * Math.PI * i) / segments
    pts.push({ x: r + r * Math.cos(theta), y: r + r * Math.sin(theta) })
  }
  return normalizePolygon(pts)
}

function normalizePolygon(points: Point2D[]): Point2D[] {
  if (points.length < 3) throw new Error("polygon: must have at least 3 vertices")
  const minX = Math.min(...points.map((p) => p.x))
  const minY = Math.min(...points.map((p) => p.y))
  const translated = points.map((p) => ({ x: p.x - minX, y: p.y - minY }))
  return ensureCCW(translated)
}

function ensureCCW(points: Point2D[]): Point2D[] {
  // Signed area on screen coords: positive == CW. Reverse to get CCW in math coords.
  let signed = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    signed += (b.x - a.x) * (b.y + a.y)
  }
  return signed > 0 ? [...points].reverse() : points
}
