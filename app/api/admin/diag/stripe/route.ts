import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"

import { requireAdmin } from "@/app/api/admin/_lib/require-admin"

/**
 * Runtime Stripe diagnostic — super-admin only. Reports whether the
 * server-side env var is wired up correctly and whether the Vercel
 * function runtime can talk to api.stripe.com.
 *
 * Hit from a logged-in super-admin browser:
 *   GET /api/admin/diag/stripe
 *
 * Returns the key prefix (NOT the secret), env presence, and the
 * outcome of an unauthenticated reachability check + an authenticated
 * balance.retrieve(). On the second one we surface the real Stripe
 * error type/message instead of the SDK's misleading retry wrapper.
 */
export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request)
  if (!guard.ok) return guard.response

  const raw = process.env.STRIPE_SECRET_KEY
  const present = typeof raw === "string" && raw.length > 0
  const keyInfo = {
    envPresent: present,
    envLength: typeof raw === "string" ? raw.length : 0,
    prefix: present && raw ? raw.slice(0, 8) : null,
    looksLive: present && raw ? raw.startsWith("sk_live_") : false,
    looksTest: present && raw ? raw.startsWith("sk_test_") : false,
    hasWhitespace: present && raw ? /\s/.test(raw) : false,
  }

  let reachable: { ok: boolean; status?: number; error?: string } = { ok: false }
  try {
    const res = await fetch("https://api.stripe.com/healthcheck", {
      method: "GET",
      signal: AbortSignal.timeout(8000),
    })
    reachable = { ok: res.ok, status: res.status }
  } catch (err) {
    reachable = {
      ok: false,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    }
  }

  let balanceCheck: {
    ok: boolean
    errorType?: string
    errorMessage?: string
    errorCode?: string
    statusCode?: number
  } = { ok: false }
  if (present && raw) {
    try {
      const client = new Stripe(raw, { apiVersion: "2026-04-22.dahlia" })
      const balance = await client.balance.retrieve()
      balanceCheck = { ok: true, ...(balance.livemode ? { livemode: balance.livemode } : {}) }
    } catch (err) {
      if (err && typeof err === "object") {
        const e = err as {
          name?: string
          message?: string
          code?: string
          statusCode?: number
          type?: string
        }
        balanceCheck = {
          ok: false,
          errorType: e.type ?? e.name,
          errorMessage: e.message,
          errorCode: e.code,
          statusCode: e.statusCode,
        }
      } else {
        balanceCheck = { ok: false, errorMessage: String(err) }
      }
    }
  }

  return NextResponse.json(
    {
      checkedAt: new Date().toISOString(),
      key: keyInfo,
      reachableHealthcheck: reachable,
      balanceCheck,
    },
    { status: 200 }
  )
}
