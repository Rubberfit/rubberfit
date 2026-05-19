/**
 * Phase 7 PR 1 — pins the public scan route (`/r/[partNumber]/pdf`).
 *
 * This is the URL the roll-label QR codes point at. Three contracts
 * must NOT drift in Phase 7:
 *
 *   1. Filename in `content-disposition` follows `<partOrId>_info.pdf`.
 *   2. `content-disposition` uses `inline` (browsers open the PDF
 *      in-tab on scan; downloads only on explicit save).
 *   3. `content-type` is `application/pdf`.
 *
 * Visual content (tokenized in PR 1) is exercised by ensuring the
 * route returns a non-empty body. Pixel-perfect output is verified
 * by attaching fixture PDFs to the PR.
 */
// @vitest-environment node
//
// Node so jsPDF runs without a DOM shim — this route serves from a
// Node runtime in production.
import { describe, it, expect, vi } from "vitest"

import type { PublicRoll } from "@/src/infrastructure/services/rollService"

// The route resolves the roll via service-role Supabase. Stub the
// helpers so the test doesn't reach for real Supabase env vars.
vi.mock("@/app/api/_lib/supabase-server", () => ({
  makeAdminClient: () => ({}),
}))

vi.mock("@/src/infrastructure/services/rollService", async () => {
  const actual = await vi.importActual<typeof import("@/src/infrastructure/services/rollService")>(
    "@/src/infrastructure/services/rollService"
  )
  return {
    ...actual,
    getPublicRollByPartNumberOrId: vi.fn(async (_client: unknown, partNumber: string) => {
      if (partNumber === "missing") return null
      // Echo whatever part number the route asked for so the filename
      // normalization test can exercise a part_number with unsafe chars.
      return {
        id: "00000000-0000-0000-0000-000000000001",
        part_number: partNumber,
        material_type: "EPDM",
        color: "Black",
        width: 48,
        length: 120,
        thickness: 0.125,
        remaining_length: 80,
        location: "A-1",
        status: "active",
        date_received: "2026-01-01",
        is_offcut: false,
        parent_roll_id: null,
      } satisfies PublicRoll
    }),
  }
})

// PR 2e: the route also resolves org-level print prefs to render the
// scan PDF in the operator's units / date format. Default mock returns
// undefined so the existing legacy-render assertions still hold;
// individual tests can override per-call via `mockResolvedValueOnce`
// to exercise non-default prefs without leaking state across tests.
// Typed as `(...) => Promise<OrgPrintPreferencesInput | undefined>`
// so the per-call override accepts the populated shape too.
import type { OrgPrintPreferencesInput } from "@/src/infrastructure/services/cut-pdf-prefs-lookup"

const orgPrefsMock = vi.hoisted(() => ({
  getOrgPreferencesForRoll:
    vi.fn<(client: unknown, rollId: string) => Promise<OrgPrintPreferencesInput | undefined>>(),
}))

vi.mock("@/src/infrastructure/services/cut-pdf-prefs-lookup", async () => {
  const actual = await vi.importActual<
    typeof import("@/src/infrastructure/services/cut-pdf-prefs-lookup")
  >("@/src/infrastructure/services/cut-pdf-prefs-lookup")
  return {
    ...actual,
    getOrgPreferencesForRoll: orgPrefsMock.getOrgPreferencesForRoll,
  }
})

interface TestRouteContext {
  readonly params: Promise<{ readonly partNumber: string }>
}

function makeContext(partNumber: string): TestRouteContext {
  return { params: Promise.resolve({ partNumber }) }
}

/**
 * Lazy-load the route module so the `app/api/_lib/supabase-server`
 * import chain (and any side-effectful Supabase init it pulls in)
 * runs INSIDE the test, after `vi.mock` has registered. CodeRabbit
 * catch — top-level imports were eager-evaluating the route's
 * Supabase deps at module load time.
 */
async function loadGetHandler() {
  const routeModule = await import("@/app/r/[partNumber]/pdf/route")
  return routeModule.GET
}

describe("GET /r/[partNumber]/pdf", () => {
  it("returns 404 when no roll matches the part number", async () => {
    const GET = await loadGetHandler()
    const res = await GET(new Request("https://x"), makeContext("missing"))
    expect(res.status).toBe(404)
  })

  it("returns an inline PDF with the legacy filename contract", async () => {
    const GET = await loadGetHandler()
    const res = await GET(new Request("https://x"), makeContext("RF-TEST-123"))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/pdf")
    expect(res.headers.get("content-disposition")).toBe('inline; filename="RF-TEST-123_info.pdf"')
    // Body should be a non-trivial PDF.
    const buffer = await res.arrayBuffer()
    expect(buffer.byteLength).toBeGreaterThan(1024)
  })

  it("strips unsafe filename characters but keeps the *_info.pdf suffix", async () => {
    // The route normalizes non-[A-Za-z0-9._-] characters to `_`. This
    // is a regression guard for the part-number → filename contract.
    const GET = await loadGetHandler()
    const res = await GET(new Request("https://x"), makeContext("RF/TEST 123"))
    // Status assertion first so a 404/500 fails the test cleanly
    // instead of pretending the header check is the actual problem
    // (CodeRabbit catch).
    expect(res.status).toBe(200)
    expect(res.headers.get("content-disposition")).toBe('inline; filename="RF_TEST_123_info.pdf"')
  })

  // PR 2e — the route fetches org print prefs after loading the roll
  // and threads them into the PDF builder. When the prefs lookup
  // returns a non-default shape the PDF must still render (units +
  // dates flow through; legacy contract preserved on size/headers).
  it("renders an inline PDF with org-level print prefs honored", async () => {
    orgPrefsMock.getOrgPreferencesForRoll.mockResolvedValueOnce({
      unitSystem: "metric",
      dateFormat: "dd/MM/yyyy",
      timeZone: "Europe/London",
      locale: "en-US",
    })
    const GET = await loadGetHandler()
    const res = await GET(new Request("https://x"), makeContext("RF-METRIC-1"))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/pdf")
    const buffer = await res.arrayBuffer()
    expect(buffer.byteLength).toBeGreaterThan(1024)
    // The lookup was called with the roll's id (resolved from the
    // mocked roll's `id` field), not the part number.
    expect(orgPrefsMock.getOrgPreferencesForRoll).toHaveBeenCalledWith(
      expect.anything(),
      "00000000-0000-0000-0000-000000000001"
    )
  })

  it("still renders when the org prefs lookup returns undefined (legacy fallback)", async () => {
    orgPrefsMock.getOrgPreferencesForRoll.mockResolvedValueOnce(undefined)
    const GET = await loadGetHandler()
    const res = await GET(new Request("https://x"), makeContext("RF-LEGACY-1"))
    expect(res.status).toBe(200)
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(1024)
  })
})
