import { describe, it, expectTypeOf } from "vitest"
import type {
  Point2D,
  ShapeSpec,
  Part,
  Bin,
  PackRequest,
  Placement,
  BinResult,
  PackResult,
  PackProgress,
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
