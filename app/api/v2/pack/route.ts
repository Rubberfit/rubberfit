import "reflect-metadata"
import { container } from "tsyringe"
import { type NextRequest, NextResponse } from "next/server"

import { AuthConfigError, ForbiddenError, UnauthorizedError } from "@/app/server/auth/errors"
import { requireAuthenticatedUser } from "@/app/server/auth/require-authenticated-user"
import { requirePermission } from "@/app/server/auth/require-permission"
import { TOKENS } from "@/di/tokens"
import "@/di/di-registration"
import type { IPackingService } from "@/src/application/services/packing.service.interface"
import { packRequestSchema } from "@/src/application/packing/types"

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

  // Reuse the action-layer auth gate so dev exercises the same policy
  // production does (cookie session → profile load → accessibility
  // check → role/permission check). Calling `auth.getUser()` alone
  // leaves a weaker dev policy than prod, which masks regressions in CI.
  //
  // `accessCutPlanner` is the same permission `proxy.ts` enforces on
  // `/dashboard/cutting-engine`, so any user who can reach the page
  // can also reach this route.
  try {
    const actor = await requireAuthenticatedUser()
    requirePermission(actor, "accessCutPlanner")
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (error instanceof AuthConfigError) {
      return NextResponse.json(
        { error: "Supabase environment variables are missing" },
        { status: 503 }
      )
    }
    throw error
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch (_error) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = packRequestSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid PackRequest", issues: parsed.error.issues },
      { status: 400 }
    )
  }
  // `.passthrough()` keeps optional tuning knobs the schema doesn't
  // declare; the Rust side handles them. The inferred shape covers
  // every required field of `PackRequest`, so it's structurally
  // assignable without a cast.
  try {
    const service = container.resolve<IPackingService>(TOKENS.IPackingService)
    const result = await service.pack(parsed.data)
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("[api/v2/pack] dev pack-cli failed:", error)
    return NextResponse.json({ error: "Pack failed", detail: message }, { status: 500 })
  }
}
