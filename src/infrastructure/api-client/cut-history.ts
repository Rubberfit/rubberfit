/**
 * Cut-history client — single source of truth for the UI's fetch
 * calls against cut-history data.
 *
 * Branches on `NEXT_PUBLIC_USE_RUST_CUT_HISTORY`:
 *
 * - `"true"`   → `/api/v2/cuts/*`, which the Next.js route handlers
 *                under `app/api/v2/**` forward to the Rust backend
 *                with the Supabase bearer token.
 * - anything   → the legacy `/api/cuts/*` Next.js routes that hit
 * else         Supabase directly via the service role.
 *
 * Consumers receive the same shape regardless of which path ran,
 * so per-request rollback is a pure flag flip with zero UI code
 * changes. Fields the Rust DTO doesn't carry yet (`stock_label`,
 * `cost_per_sqft`, `pdf_url`, `part_custom_dimensions`) are
 * returned as `null` on the v2 path — callers that need them
 * must already handle nullability, which they do because legacy
 * rows can have nulls too.
 */
import type { CutHistory } from "@/src/infrastructure/models/supabase"

import type { components } from "./types"

type CutHistoryDto = components["schemas"]["CutHistoryDto"]

export interface ListHistoryOptions {
  /** Lower bound on `cut_date` (ISO-8601, inclusive). */
  from?: string
  /** Upper bound on `cut_date` (ISO-8601, inclusive). */
  to?: string
  /** Legacy API supports filtering by another user (admin-only). v2 relies on RLS. */
  userId?: string
  /** Max rows to return. Clamped by the server. */
  limit?: number
  page?: number
}

/**
 * Read the feature flag at call time (not module load) so a test
 * or dev-console flip takes effect without needing a server reload.
 */
function useRustBackend(): boolean {
  return process.env.NEXT_PUBLIC_USE_RUST_CUT_HISTORY === "true"
}

function dtoToCutHistory(dto: CutHistoryDto): CutHistory {
  return {
    id: dto.id,
    user_id: dto.user_id ?? null,
    // Rust DTO doesn't carry roll_id / job_id / job_part_id yet;
    // legacy + v2 rows default to null.
    roll_id: null,
    job_id: null,
    job_part_id: null,
    material_id: dto.material_id,
    part_id: dto.part_id,
    cut_length: dto.cut_length,
    cut_width: dto.cut_width,
    cut_thickness: dto.cut_thickness,
    part_custom_width: dto.part_custom_width ?? null,
    part_custom_height: dto.part_custom_height ?? null,
    part_selected_size: dto.part_selected_size ?? null,
    part_selected_size_text: dto.part_selected_size_text ?? null,
    part_selected_label: dto.part_selected_label ?? null,
    // The Rust DTO doesn't carry these yet — they live on the v1
    // Supabase table but haven't been promoted to `rf-domain` /
    // `CutHistoryEntry`. Callers already tolerate nulls (legacy rows
    // can be null too), so widening the DTO is a follow-up, not a
    // blocker for the cutover.
    part_custom_dimensions: null,
    cut_amount: dto.cut_amount,
    parts_completed: dto.parts_completed,
    material_used_sqft: dto.material_used_sqft,
    reusable_offset_sqft: dto.reusable_offset_sqft,
    scrap_sqft: dto.scrap_sqft,
    fab_score: dto.fab_score,
    cut_pieces: dto.cut_pieces,
    stock_label: null,
    cost_per_sqft: null,
    pdf_url: null,
    // cut_date is nullable on the Rust DTO but NON-nullable on the
    // TS model. Fall back to created_at, then to the epoch — callers
    // sort by cut_date so undefined would explode. The epoch case
    // only triggers for bad data.
    cut_date: dto.cut_date ?? dto.created_at ?? new Date(0).toISOString(),
    created_at: dto.created_at ?? new Date(0).toISOString(),
    updated_at: dto.updated_at ?? new Date(0).toISOString(),
    // Rust DTO exposes `source` post-C12 migration. Pre-migration
    // rows deserialize as undefined; default to "auto" to match the
    // DB column default.
    source: dto.source === "manual" ? "manual" : "auto",
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`)
  }
  return (await res.json()) as T
}

export async function listCutHistory(opts: ListHistoryOptions = {}): Promise<CutHistory[]> {
  if (useRustBackend()) {
    const params = new URLSearchParams()
    if (opts.limit !== undefined) params.set("limit", String(opts.limit))
    if (opts.from) params.set("since", opts.from)
    if (opts.to) params.set("until", opts.to)
    // userId is deliberately NOT forwarded — the Rust backend scopes
    // by the bearer JWT's `sub` claim via RLS. An admin-style
    // user-picker would need a dedicated v2 endpoint later.
    const qs = params.toString()
    const url = qs ? `/api/v2/cuts/history?${qs}` : "/api/v2/cuts/history"
    const rows = await fetchJson<CutHistoryDto[]>(url)
    return rows.map(dtoToCutHistory)
  }

  // Legacy path — same shape the hook was reading before.
  const params = new URLSearchParams()
  params.set("limit", String(opts.limit ?? 100))
  if (opts.page !== undefined) params.set("page", String(opts.page))
  if (opts.from) params.set("from", opts.from)
  if (opts.to) params.set("to", opts.to)
  if (opts.userId) params.set("userId", opts.userId)
  const res = await fetchJson<{ data: CutHistory[] }>(`/api/cuts/history?${params.toString()}`)
  return res.data
}

export interface FavoritesResult {
  /**
   * The set of cut-history ids favorited by the caller. The hook
   * uses this as a lookup, not a list of rows.
   */
  ids: Set<number>
}

export async function listFavoriteIds(): Promise<FavoritesResult> {
  if (useRustBackend()) {
    // v2 returns the full favorite entries; the hook only needs ids.
    const rows = await fetchJson<CutHistoryDto[]>("/api/v2/cuts/favorites")
    return { ids: new Set(rows.map((r) => r.id)) }
  }
  const res = await fetchJson<{ data: number[] }>("/api/cuts/favorites")
  return { ids: new Set(res.data) }
}
