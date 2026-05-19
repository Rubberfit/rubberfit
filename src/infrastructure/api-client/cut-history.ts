/**
 * Cut-history client — single source of truth for the UI's fetch
 * calls against cut-history data.
 *
 * The Rust v2 backend is the canonical surface; flag-OFF branches
 * throw `cutHistoryFlagOffError` to direct operators to flip
 * `NEXT_PUBLIC_USE_RUST_CUT_HISTORY=true`. Mirrors the PO + reorder
 * retirement pattern in `src/infrastructure/api-client/rf/procurement.ts`.
 *
 * Fields the Rust DTO doesn't carry yet (`stock_label`, `cost_per_sqft`,
 * `pdf_url`, `part_custom_dimensions`, `kerf`, `roll_id`, `job_id`,
 * `job_part_id`, `layout_json`) are returned as `null` on the v2 path —
 * widening the DTO to carry them is a follow-up; callers already
 * tolerate nulls because legacy rows could carry them too.
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
function isRustBackendEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USE_RUST_CUT_HISTORY === "true"
}

function dtoToCutHistory(dto: CutHistoryDto): CutHistory {
  return {
    // v2 DTO still types id as `number` (openapi codegen lagging on
    // the string/UUID migration); stringify so consumers can treat
    // the id uniformly with the native Postgres UUID rows.
    id: String(dto.id),
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
    // Rust DTO doesn't surface kerf yet — fall back to the column's
    // default (0.125") so the TS model stays non-null. Promoting kerf
    // onto `rf-domain` / `CutHistoryEntry` is a follow-up, same shape
    // as the cost_per_sqft / stock_label gaps already noted below.
    kerf: 0.125,
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
    // Rust DTO doesn't carry `layout_json` yet — widening the DTO is
    // a follow-up, not a blocker. Until then, rows loaded via the v2
    // path come back with `layout_json: null` and load-cut gracefully
    // degrades to "no saved layout" messaging. Legacy TS route reads
    // the column natively via `select('*')`.
    layout_json: null,
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`)
  }
  return (await res.json()) as T
}

// `legacyCutHistoryService` was retired alongside this surface — flag-OFF
// branches below throw so operators are explicitly directed to flip
// `NEXT_PUBLIC_USE_RUST_CUT_HISTORY=true`. Matches the PO + reorder pattern.
function cutHistoryFlagOffError(operation: string): Error {
  return new Error(
    `cut-history ${operation} flag-OFF path not wired (legacyCutHistoryService retired); flip NEXT_PUBLIC_USE_RUST_CUT_HISTORY=true for this surface`
  )
}

export async function listCutHistory(opts: ListHistoryOptions = {}): Promise<CutHistory[]> {
  if (!isRustBackendEnabled()) {
    throw cutHistoryFlagOffError("list")
  }
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

export interface FavoritesResult {
  /**
   * The set of cut-history ids favorited by the caller. The hook
   * uses this as a lookup, not a list of rows. IDs are GUID strings
   * post-migration to UUID primary keys.
   */
  ids: Set<string>
}

export async function listFavoriteIds(): Promise<FavoritesResult> {
  if (!isRustBackendEnabled()) {
    throw cutHistoryFlagOffError("favorites")
  }
  // v2 returns the full favorite entries; the hook only needs ids.
  // v2 DTO still types id as number — stringify to match the
  // UUID-string migration on the v1 path.
  const rows = await fetchJson<CutHistoryDto[]>("/api/v2/cuts/favorites")
  return { ids: new Set(rows.map((r) => String(r.id))) }
}
