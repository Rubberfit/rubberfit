import { describe, expect, it } from "vitest"

import { getPublicRollByPartNumberOrId } from "@/src/infrastructure/services/rollService"
import { makeFakeClient } from "@/tests/helpers/fake-supabase-client"

describe("getPublicRollByPartNumberOrId", () => {
  const ROLL = {
    id: "11111111-2222-3333-4444-555555555555",
    part_number: "RF-000123",
    material_type: "Butyl",
    width: 60,
    length: 240,
    thickness: 0.5,
    remaining_length: 180,
    status: "active" as const,
    color: "black",
    location: "Bay A",
    date_received: "2026-01-01",
    is_offcut: false,
    parent_roll_id: null,
  }

  it("looks up by part_number first", async () => {
    const client = makeFakeClient({
      tables: { rolls: { select: { data: [ROLL], error: null } } },
    })
    expect(await getPublicRollByPartNumberOrId(client, "RF-000123")).toEqual(ROLL)
  })

  it("returns null on empty input", async () => {
    const client = makeFakeClient({
      tables: { rolls: { select: { data: null, error: null } } },
    })
    expect(await getPublicRollByPartNumberOrId(client, "   ")).toBeNull()
  })

  it("returns null when not found and input isn't UUID-shaped", async () => {
    const client = makeFakeClient({
      tables: { rolls: { select: { data: null, error: null } } },
    })
    expect(await getPublicRollByPartNumberOrId(client, "not-a-uuid-name")).toBeNull()
  })
})
