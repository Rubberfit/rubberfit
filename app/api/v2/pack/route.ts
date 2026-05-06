import "reflect-metadata"
import { container } from "tsyringe"
import { type NextRequest, NextResponse } from "next/server"

import { makeAuthClient } from "@/app/api/_lib/supabase-server"
import { TOKENS } from "@/di/tokens"
import "@/di/di-registration"
import type { IPackingService } from "@/src/application/services/packing.service.interface"
import type { PackRequest } from "@/src/application/packing/types"

/**
 * Server boundary for the Rust packing engine — DEV ONLY.
 *
 * Production traffic to `/api/v2/pack` is served by the Vercel Rust
 * function at `api/v2/pack.rs`, registered in `vercel.json`'s
 * `functions` block. That function runs the packer in-process via the
 * `rf-layout` crate.
 *
 * This Next.js route is the local-dev fallback. `npm run dev` doesn't
 * run Vercel Rust functions, so without this handler every Pack click
 * returns Next.js's 404 HTML page. The migration commit (`ace7dfb`)
 * removed it on the assumption that devs would use `vercel dev`; in
 * practice that's a worse DX, so we restore the route and guard it
 * out of Vercel builds two ways:
 *
 *   1. `.vercelignore` lists `app/api/v2/pack/` — the file never
 *      uploads to Vercel and can't appear in `.next/` server output.
 *   2. The runtime guard below short-circuits to 410 if
 *      `process.env.VERCEL` is set. Belt-and-suspenders against any
 *      future build path that bypasses `.vercelignore`. Vercel's
 *      tie-breaker between this route and `api/v2/pack.rs` is
 *      undefined and we don't want to find out which one wins on a
 *      preview deploy.
 *
 * The handler resolves `IPackingService` from the DI container, which
 * binds to `RustPackingService` when `IS_SERVER && NODE_ENV !== "production"`.
 * `RustPackingService` spawns the `pack-cli` binary via
 * `node:child_process`. Build it once with `npm run build:engine`.
 *
 * Node runtime (not edge) because child_process + native binary.
 * 300 s budget matches the Rust thorough-mode ceiling.
 */
export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Guard 2 (see header): if this route somehow reaches a Vercel
  // build, refuse rather than risk shadowing the Rust function.
  if (process.env.VERCEL === "1") {
    return NextResponse.json(
      {
        error:
          "This dev-only route should not be deployed. Production /api/v2/pack is served by api/v2/pack.rs (Vercel Rust function).",
      },
      { status: 410 }
    )
  }

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

  let body: PackRequest
  try {
    body = (await request.json()) as PackRequest
  } catch (_error) {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("[api/v2/pack] dev pack-cli failed:", error)
    return NextResponse.json({ error: "Pack failed", detail: message }, { status: 500 })
  }
}
