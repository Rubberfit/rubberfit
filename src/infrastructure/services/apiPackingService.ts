import "reflect-metadata"
import { injectable } from "tsyringe"
import type { IPackingService } from "@/src/application/services/packing.service.interface"
import type { PackRequest, PackResult } from "@/src/application/packing/types"

// Browser-side IPackingService implementation. POSTs the PackRequest to
// the `/api/v2/pack` route, where RustPackingService spawns the pack-cli
// subprocess. The route handler attaches the Supabase session cookie
// automatically, so the auth check there passes for any user already
// signed into the dashboard.
@injectable()
export class ApiPackingService implements IPackingService {
  async pack(request: PackRequest): Promise<PackResult> {
    const res = await fetch("/api/v2/pack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => "")
      throw new Error(`pack failed (${res.status}): ${detail.slice(0, 200)}`)
    }
    return (await res.json()) as PackResult
  }
}
