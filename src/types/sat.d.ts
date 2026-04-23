// Minimal type declarations for the `sat` npm package (Jim Riecken's
// Separating Axis Theorem collision library). Only covers the parts
// we use for Free-roam canvas collision detection. Expand as callers
// grow. See https://github.com/jriecken/sat-js for the full API.

declare module "sat" {
  export class Vector {
    x: number
    y: number
    constructor(x?: number, y?: number)
  }

  export class Polygon {
    /** Reference position; polygon points are offsets from this. */
    pos: Vector
    /** Array of offset vectors relative to `pos`. */
    points: Vector[]
    constructor(pos?: Vector, points?: Vector[])
    setPoints(points: Vector[]): Polygon
  }

  export class Circle {
    pos: Vector
    r: number
    constructor(pos?: Vector, radius?: number)
  }

  /** Pairwise polygon intersection test. Returns true when they overlap. */
  export function testPolygonPolygon(a: Polygon, b: Polygon): boolean
  export function testPolygonCircle(p: Polygon, c: Circle): boolean
  export function testCirclePolygon(c: Circle, p: Polygon): boolean
  export function testCircleCircle(a: Circle, b: Circle): boolean
}
