import { describe, it, expect } from "vitest"
import { buildPackRequest } from "@/src/application/packing/buildPackRequest"
import { PACK_MODE_BUDGETS_MS } from "@/src/application/packing/types"
import type { Part, Bin } from "@/src/application/packing/types"

const PART_A: Part = {
  shapeId: "a",
  quantity: 2,
  polygon: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 5 },
    { x: 0, y: 5 },
  ],
  allowRotation: true,
}

const BIN_FRESH: Bin = { binId: "b1", width: 48, height: 96, kind: "fresh" }
const BIN_REMNANT: Bin = { binId: "b2", width: 48, height: 20, kind: "remnant", priority: 10 }

describe("buildPackRequest", () => {
  it("uses mode preset for timeBudgetMs when not explicit", () => {
    const req = buildPackRequest({
      bins: [BIN_FRESH],
      items: [PART_A],
      clearance: 0.125,
      mode: "balanced",
    })
    expect(req.timeBudgetMs).toBe(PACK_MODE_BUDGETS_MS.balanced)
  })

  it("explicit timeBudgetMs overrides mode", () => {
    const req = buildPackRequest({
      bins: [BIN_FRESH],
      items: [PART_A],
      clearance: 0.125,
      mode: "fast",
      timeBudgetMs: 7000,
    })
    expect(req.timeBudgetMs).toBe(7000)
  })

  it("orders bins: priority desc, then remnants first, then insertion order", () => {
    const req = buildPackRequest({
      bins: [BIN_FRESH, BIN_REMNANT],
      items: [PART_A],
      clearance: 0.125,
    })
    expect(req.bins.map((b) => b.binId)).toEqual(["b2", "b1"])
  })

  it("preserves insertion order when priority and kind are equal (stable sort)", () => {
    const bin1: Bin = { binId: "first", width: 48, height: 96, kind: "fresh", priority: 5 }
    const bin2: Bin = { binId: "second", width: 48, height: 96, kind: "fresh", priority: 5 }
    const bin3: Bin = { binId: "third", width: 48, height: 96, kind: "fresh", priority: 5 }
    const req = buildPackRequest({
      bins: [bin1, bin2, bin3],
      items: [PART_A],
      clearance: 0.125,
    })
    expect(req.bins.map((b) => b.binId)).toEqual(["first", "second", "third"])
  })

  it("defaults mode to balanced when absent", () => {
    const req = buildPackRequest({
      bins: [BIN_FRESH],
      items: [PART_A],
      clearance: 0.125,
    })
    expect(req.mode).toBe("balanced")
    expect(req.timeBudgetMs).toBe(PACK_MODE_BUDGETS_MS.balanced)
  })

  it("throws when no bins provided", () => {
    expect(() =>
      buildPackRequest({ bins: [], items: [PART_A], clearance: 0.125 })
    ).toThrow(/bins/i)
  })

  it("throws when no items provided", () => {
    expect(() =>
      buildPackRequest({ bins: [BIN_FRESH], items: [], clearance: 0.125 })
    ).toThrow(/items/i)
  })
})
