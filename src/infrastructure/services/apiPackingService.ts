import "reflect-metadata"
import { injectable } from "tsyringe"
import type { IPackingService } from "@/src/application/services/packing.service.interface"
import type { PackRequest, PackResult } from "@/src/application/packing/types"
import { getSupabaseClient } from "@/src/infrastructure/models/supabase"

// Browser-side IPackingService. POSTs the PackRequest to /api/v2/pack —
// a Vercel Rust function (`api/v2/pack.rs`) that runs the packer
// in-process. Auth: Supabase access token via Authorization Bearer.
// The Rust handler validates against Supabase JWKS (RS256 + issuer).
@injectable()
export class ApiPackingService implements IPackingService {
  async pack(request: PackRequest): Promise<PackResult> {
    // Surface the real Supabase error if `getSession()` fails (network
    // issue, refresh-token expired, broken local storage, etc.) rather
    // than masking it as "not signed in" — that ambiguity made earlier
    // deploy debugging harder than it had to be.
    const { data, error } = await getSupabaseClient().auth.getSession()
    if (error) {
      throw new Error(`pack auth error: failed to load Supabase session — ${error.message}`)
    }
    const token = data.session?.access_token
    if (!token) {
      throw new Error("not signed in — cannot call /api/v2/pack")
    }
    const res = await fetch("/api/v2/pack", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(request),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => "")
      throw new Error(`pack failed (${res.status}): ${detail.slice(0, 200)}`)
    }
    return (await res.json()) as PackResult
  }
}
