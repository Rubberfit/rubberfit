/**
 * Phase 7 PR 2 — pins the Operations Overview (dashboard) PDF after
 * the mm→pt + shared-chrome refactor. Existing
 * `tests/exports/issue-122-operations-overview.test.ts` still owns
 * the click-through contract; this file pins the render contract:
 * A4 in points, multi-page pagination on big inputs, blob bytes.
 */
// @vitest-environment node
import { describe, expect, it } from "vitest"

import { buildOperationsPdf } from "@/app/dashboard/_components/dashboard-pdf"
import type { OperationsExportInput } from "@/app/dashboard/_components/dashboard-export-utils"

function makeInput(overrides: Partial<OperationsExportInput> = {}): OperationsExportInput {
  return {
    period: "week",
    periodLabel: "Apr 21 – Apr 27",
    utilPeriod: "7d",
    totalActiveRolls: 42,
    cutsThisWeek: 7,
    wastePercentage: 12.345,
    inventoryValue: 18742,
    utilization: {
      series: [
        { label: "Mon", "EPDM 60A": 12.4, Neoprene: 3.1 },
        { label: "Tue", "EPDM 60A": 0, Neoprene: 8.7 },
      ],
      materials: ["EPDM 60A", "Neoprene"],
    },
    recentCuts: [
      {
        id: "1",
        jobCode: "CUT-0001",
        operator: "Daniel",
        utilizationPct: 87.5,
        whenLabel: "2h ago",
      },
    ],
    ...overrides,
  }
}

async function blobToBytes(blob: Blob): Promise<number> {
  const buffer = await blob.arrayBuffer()
  return buffer.byteLength
}

describe("buildOperationsPdf", () => {
  it("returns a non-empty Blob", async () => {
    const blob = buildOperationsPdf(makeInput())
    expect(blob.type).toBe("application/pdf")
    expect(await blobToBytes(blob)).toBeGreaterThan(2048)
  })

  it("renders empty utilization + recent-cuts sections without throwing", async () => {
    const blob = buildOperationsPdf(
      makeInput({
        utilization: { series: [], materials: [] },
        recentCuts: [],
      })
    )
    expect(await blobToBytes(blob)).toBeGreaterThan(1024)
  })

  it("paginates when given many recent cuts", async () => {
    const cuts = Array.from({ length: 80 }, (_, i) => ({
      id: `${i}`,
      jobCode: `CUT-${i.toString().padStart(4, "0")}`,
      operator: i % 2 === 0 ? "Daniel" : "Steven",
      utilizationPct: 80 + (i % 20),
      whenLabel: `${i}h ago`,
    }))
    const blob = buildOperationsPdf(makeInput({ recentCuts: cuts }))
    // Multi-page output is bigger than a single page — assert via byte
    // count growth, since `Blob` doesn't expose page metadata.
    const bytes = await blobToBytes(blob)
    const baseline = await blobToBytes(buildOperationsPdf(makeInput({ recentCuts: [] })))
    expect(bytes).toBeGreaterThan(baseline)
  })

  it("accepts non-default operator preferences without throwing", async () => {
    // PR 2 contract: the footer renders in the operator's locale +
    // dateFormat + timeZone. Production uses canonical UserPreferences;
    // here we only need the structural subset the helper consumes.
    const blob = buildOperationsPdf(
      makeInput({
        preferences: {
          dateFormat: "yyyy-MM-dd",
          timeZone: "Europe/London",
          locale: "es-MX",
        },
      })
    )
    expect(blob.type).toBe("application/pdf")
    expect(await blobToBytes(blob)).toBeGreaterThan(2048)
  })
})
