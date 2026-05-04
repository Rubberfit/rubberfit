import "reflect-metadata"
import { container } from "tsyringe"
import { type NextRequest, NextResponse } from "next/server"

import { makeAuthClient } from "@/app/api/_lib/supabase-server"
import { TOKENS } from "@/di/tokens"
import "@/di/di-registration"
import type { IPackingService } from "@/src/application/services/packing.service.interface"
import type { PackRequest } from "@/src/application/packing/types"

/**
 * Server boundary for the Rust packing engine.
 *
 * `RustPackingService.pack()` spawns the `pack-cli` binary via
 * `node:child_process` and is therefore server-only. Browser callers
 * (the cutting-engine Auto-nest + Free-roam flows) POST a PackRequest
 * to this route; the handler resolves the service from the DI container,
 * runs pack-cli, and returns the PackResult as JSON.
 *
 * Node runtime (not edge) because child_process + native binary.
 * 300 s budget matches the Rust thorough mode ceiling.
 */
export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Auth — same pattern as other mutation routes.
  const authClient = makeAuthClient(request)
  if (!authClient) {
    return NextResponse.json(
      { error: "Supabase environment variables are missing" },
      { status: 503 }
    )
  }
  const {
    data: { user },
  } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Parse + shape-check the PackRequest body.
  let body: PackRequest
  try {
    body = (await request.json()) as PackRequest
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (!body || !Array.isArray(body.bins) || !Array.isArray(body.items)) {
    return NextResponse.json(
      { error: "Invalid PackRequest: `bins` and `items` arrays required" },
      { status: 400 }
    )
  }

  try {
    const service = container.resolve<IPackingService>(TOKENS.IPackingService)
    const result = await service.pack(body)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[api/v2/pack] pack-cli failed:", err)
    return NextResponse.json({ error: "Pack failed", detail: message }, { status: 500 })
  }
}
