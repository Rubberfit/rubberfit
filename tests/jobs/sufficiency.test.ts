import { describe, expect, it } from "vitest"

import {
  aggregateSufficiency,
  type SufficiencyAllocation,
  type SufficiencyRoll,
} from "@/src/infrastructure/repositories/jobs.repository"
import type { JobPart } from "@/src/infrastructure/models/supabase"

// Lightweight JobPart builder — tests only care about the fields
// aggregateSufficiency reads, but TS needs the full shape.
function part(overrides: Partial<JobPart>): JobPart {
  const base: JobPart = {
    id: crypto.randomUUID(),
    user_id: "user-1",
    job_id: "job-1",
    material_type_id: null,
    material_type: "Butyl",
    part_number: null,
    description: null,
    width: 12,
    length: 36,
    thickness: null,
    quantity: 1,
    unit_price: null,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  }
  return { ...base, ...overrides }
}

function roll(overrides: Partial<SufficiencyRoll> & { id: string }): SufficiencyRoll {
  return {
    id: overrides.id,
    part_number: overrides.part_number ?? `RF-${overrides.id}`,
    material_type: overrides.material_type ?? "Butyl",
    width: overrides.width ?? 48,
    remaining_length: overrides.remaining_length ?? 120,
    location: overrides.location ?? "Bay A",
  }
}

describe("aggregateSufficiency", () => {
  it("returns empty when there are no parts", () => {
    expect(aggregateSufficiency([], [roll({ id: "r1" })], [])).toEqual([])
  })

  it("covers a job when total sqft is within available", () => {
    // 12"x36"x1 = 3 sqft. Roll has 48x120 = 40 sqft. Plenty.
    const result = aggregateSufficiency(
      [part({ width: 12, length: 36, quantity: 1 })],
      [roll({ id: "r1", width: 48, remaining_length: 120 })],
      []
    )
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      material: "Butyl",
      needed_sqft: 3,
      available_sqft: 40,
      shortfall_sqft: 0,
      reserved_sqft: 0,
      infeasible_parts: [],
    })
  })

  it("flags parts wider than the widest available roll as infeasible", () => {
    const wide = part({
      id: "p-oversized",
      description: "Oversized gasket",
      width: 60,
      length: 24,
      quantity: 2,
    })
    const fine = part({ width: 24, length: 24, quantity: 1 })
    const result = aggregateSufficiency(
      [wide, fine],
      [roll({ id: "r1", width: 48, remaining_length: 120 })],
      []
    )
    expect(result[0].infeasible_parts).toHaveLength(1)
    expect(result[0].infeasible_parts[0]).toMatchObject({
      id: "p-oversized",
      description: "Oversized gasket",
      width: 60,
      quantity: 2,
    })
    expect(result[0].max_required_width).toBe(60)
    expect(result[0].max_available_width).toBe(48)
  })

  it("treats a material with zero rolls as fully infeasible", () => {
    const p = part({ material_type: "EPDM", width: 12, length: 36, quantity: 1 })
    const result = aggregateSufficiency([p], [], [])
    expect(result[0].material).toBe("EPDM")
    expect(result[0].infeasible_parts).toHaveLength(1)
    expect(result[0].max_available_width).toBe(0)
    expect(result[0].available_sqft).toBe(0)
    // Needed still reflects the work the job asks for.
    expect(result[0].needed_sqft).toBe(3)
    expect(result[0].shortfall_sqft).toBe(3)
  })

  it("subtracts other-job allocations from availability", () => {
    // Roll: 48"x120 = 40 sqft total. Other job reserved 60" = 20 sqft.
    // Effective availability = 40 - 20 = 20 sqft.
    const result = aggregateSufficiency(
      [part({ width: 24, length: 144, quantity: 1 })], // 24 sqft needed
      [roll({ id: "r1", width: 48, remaining_length: 120 })],
      [{ roll_id: "r1", allocated_length: 60 }]
    )
    expect(result[0].available_sqft).toBe(20)
    expect(result[0].reserved_sqft).toBe(20)
    // Needed 24, available 20 → short 4.
    expect(result[0].shortfall_sqft).toBe(4)
  })

  it("caps reservation at the roll's remaining length", () => {
    // Other job "reserved" more than what's left — the cap keeps
    // reserved_sqft from exceeding the roll's actual remainder.
    const result = aggregateSufficiency(
      [part({ width: 12, length: 36, quantity: 1 })],
      [roll({ id: "r1", width: 48, remaining_length: 10 })],
      [{ roll_id: "r1", allocated_length: 9999 }]
    )
    // Reserved cannot exceed remaining (10" × 48" / 144 ≈ 3.33 sqft).
    expect(result[0].reserved_sqft).toBeCloseTo(3.33, 1)
    // Nothing left to use.
    expect(result[0].available_sqft).toBe(0)
  })

  it("sums multiple other-job allocations on the same roll", () => {
    const result = aggregateSufficiency(
      [part({ width: 12, length: 36, quantity: 1 })],
      [roll({ id: "r1", width: 48, remaining_length: 120 })],
      [
        { roll_id: "r1", allocated_length: 30 },
        { roll_id: "r1", allocated_length: 20 },
      ]
    )
    // 30 + 20 = 50" reserved → 50 × 48 / 144 ≈ 16.67 sqft reserved.
    expect(result[0].reserved_sqft).toBeCloseTo(16.67, 1)
    // Remaining available: (120 - 50) × 48 / 144 ≈ 23.33 sqft.
    expect(result[0].available_sqft).toBeCloseTo(23.33, 1)
  })

  it("groups parts + rolls by normalised material (case + whitespace)", () => {
    const result = aggregateSufficiency(
      [
        part({ material_type: "Butyl", width: 12, length: 36, quantity: 1 }),
        part({ material_type: "butyl ", width: 24, length: 36, quantity: 1 }),
      ],
      [roll({ id: "r1", material_type: "BUTYL", width: 48, remaining_length: 120 })],
      []
    )
    expect(result).toHaveLength(1)
    // 3 + 6 = 9 sqft needed across both part lines.
    expect(result[0].needed_sqft).toBe(9)
  })

  it("falls back to 'Unspecified' when material is null or empty", () => {
    const result = aggregateSufficiency(
      [part({ material_type: null, width: 12, length: 36, quantity: 1 })],
      [],
      []
    )
    expect(result[0].material).toBe("Unspecified")
    expect(result[0].infeasible_parts).toHaveLength(1)
  })

  it("sorts infeasibility first, then shortfall, then alphabetical", () => {
    const result = aggregateSufficiency(
      [
        // EPDM: feasible, no shortfall (covered)
        part({
          material_type: "EPDM",
          width: 12,
          length: 24,
          quantity: 1,
        }),
        // Butyl: infeasible width
        part({
          material_type: "Butyl",
          width: 60,
          length: 24,
          quantity: 1,
        }),
        // Nitrile: shortfall but feasible
        part({
          material_type: "Nitrile",
          width: 24,
          length: 144,
          quantity: 5,
        }),
      ],
      [
        roll({ id: "r1", material_type: "EPDM", width: 48, remaining_length: 120 }),
        roll({ id: "r2", material_type: "Butyl", width: 48, remaining_length: 120 }),
        roll({ id: "r3", material_type: "Nitrile", width: 48, remaining_length: 40 }),
      ],
      []
    )
    expect(result.map((r) => r.material)).toEqual(["Butyl", "Nitrile", "EPDM"])
  })

  it("treats zero-quantity parts as zero demand", () => {
    const result = aggregateSufficiency(
      [
        part({ width: 12, length: 36, quantity: 0 }),
        part({ width: 12, length: 36, quantity: 2 }),
      ],
      [roll({ id: "r1", width: 48, remaining_length: 120 })],
      []
    )
    // Only the quantity-2 part contributes: 12 × 36 × 2 / 144 = 6 sqft.
    expect(result[0].needed_sqft).toBe(6)
  })

  it("ignores allocations whose roll is not in the material's roll set", () => {
    // Allocation for a different roll id should never bleed into
    // this material's availability.
    const result = aggregateSufficiency(
      [part({ width: 12, length: 36, quantity: 1 })],
      [roll({ id: "r1", width: 48, remaining_length: 120 })],
      [{ roll_id: "r-unknown", allocated_length: 60 }]
    )
    expect(result[0].reserved_sqft).toBe(0)
    expect(result[0].available_sqft).toBe(40)
  })
})
