import { describe, it, expectTypeOf } from "vitest"
import type {
  Point2D,
  PolygonWithHoles,
  ShapeSpec,
  Part,
  Bin,
  PackRequest,
  Placement,
  BinResult,
  PackResult,
} from "@/src/application/packing/types"

describe("canonical types", () => {
  it("Point2D has numeric x/y", () => {
    expectTypeOf<Point2D>().toHaveProperty("x").toBeNumber()
    expectTypeOf<Point2D>().toHaveProperty("y").toBeNumber()
  })

  it("PolygonWithHoles has outer + holes loops", () => {
    expectTypeOf<PolygonWithHoles>().toHaveProperty("outer").toEqualTypeOf<Point2D[]>()
    expectTypeOf<PolygonWithHoles>().toHaveProperty("holes").toEqualTypeOf<Point2D[][]>()
  })

  it("Part requires allowRotation, shapeId, quantity; polygon is optional (Rust materialises from shapeSpec)", () => {
    expectTypeOf<Part>()
      .toHaveProperty("polygon")
      .toEqualTypeOf<PolygonWithHoles | undefined>()
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
    expectTypeOf<Placement>().toHaveProperty("polygon").toEqualTypeOf<PolygonWithHoles>()
  })
})
