/**
 * Internal endpoint the Rust backend calls to proxy the TS tax
 * service during S3c. This route is NOT part of the `/api/v2/**`
 * contract — it exists only so the Rust PO create/update use cases
 * can reuse the proven
 * `taxService.calculatePurchaseOrderTax(supplierId, subtotal)`
 * behavior (supplier_exempt + supplier override + ZIPTAX + cache)
 * without re-implementing it in Rust for S3c. The full Rust port
 * lives in S3d.
 *
 * Auth: `Authorization: Bearer <supabase_jwt>`. We verify the JWT
 * against Supabase so the route can't be called from arbitrary
 * origins on the Fly machine or the LAN. Rust forwards the caller's
 * JWT verbatim; for the PO-write path that's the user who triggered
 * the create/update. The session/service role is NEVER used here.
 *
 * URL:
 * `GET /api/internal/tax/po-preview?supplier_id=<uuid>&subtotal=<number>`
 * Response: `TaxCalculation` JSON exactly as the TS service emits.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import "reflect-metadata"

import { resolveUseCase } from "@/di/resolve"
import { TOKENS } from "@/di/tokens"
import type { ITaxService } from "@/src/application/services/tax.service.interface"

const BEARER_RE = /^Bearer\s+(.+)$/i

/**
 * Parse the subtotal query param. We reject NaN / Infinity / negative
 * values early so a malformed caller sees a 400 instead of a
 * mysterious tax calc result. The TS service quietly returns 0 for
 * an invalid subtotal today — keeping the Rust → TS hop strict
 * here prevents that silent-zero from leaking into PO write paths.
 */
function parseSubtotal(raw: string | null): number | null {
  if (raw === null) return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

/**
 * Module-scoped Supabase client used only for JWT verification. The
 * PO write hot path calls this route on every create/update; building
 * a fresh client per request burns a non-trivial amount of CPU (new
 * fetch handler + auth state machine + config validation). The
 * client's `auth.getUser(token)` is stateless — no per-call session
 * tracking — so reusing a shared instance is safe.
 *
 * Resolved lazily on first call so missing env at import time
 * doesn't crash the Next.js bundler; returns `null` if env is
 * misconfigured, which verifyBearer surfaces as a 401.
 */
let cachedAuthClient: SupabaseClient | null = null
let authClientInitialized = false
function getAuthClient(): SupabaseClient | null {
  if (authClientInitialized) return cachedAuthClient
  authClientInitialized = true
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) return null
  cachedAuthClient = createClient(supabaseUrl, anonKey)
  return cachedAuthClient
}

async function verifyBearer(token: string): Promise<boolean> {
  const client = getAuthClient()
  if (!client) return false
  const { data, error } = await client.auth.getUser(token)
  return !error && !!data.user
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization") ?? ""
  const match = BEARER_RE.exec(authHeader)
  if (!match) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const ok = await verifyBearer(match[1])
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const supplierId = searchParams.get("supplier_id")?.trim() ?? ""
  const subtotal = parseSubtotal(searchParams.get("subtotal"))

  if (subtotal === null) {
    return NextResponse.json(
      { error: "subtotal must be a finite non-negative number" },
      { status: 400 }
    )
  }

  try {
    const taxService = resolveUseCase<ITaxService>(TOKENS.ITaxService)
    // Empty supplier_id → the service returns the default tax calc
    // (matches the existing TS PO-create behavior where the user
    // hasn't picked a supplier yet but the dialog still previews).
    const result = await taxService.calculatePurchaseOrderTax(supplierId, subtotal)
    return NextResponse.json(result)
  } catch (error) {
    console.error("tax po-preview failed", { supplierId, subtotal, error })
    return NextResponse.json(
      { error: "tax calculation failed" },
      { status: 502 }
    )
  }
}
