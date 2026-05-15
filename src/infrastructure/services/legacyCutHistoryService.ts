/**
 * @deprecated Legacy raw-row cut-history surface — pre-DDD code path
 * retained so the production API routes
 * (`app/api/cuts/history/route.ts`, `[id]/route.ts`, `[id]/pdf/route.ts`,
 * `app/api/analytics/cut-history/route.ts`) and the live
 * `RecordCutUseCase` keep working unchanged.
 *
 * The new entity-typed `CutHistoryService` lives at
 * `src/infrastructure/services/cutHistoryService.ts` and exposes
 * `getById` / `getAll` / `getRecent` / `getByUser` / `getByRoll` /
 * `create` / `softDelete` through `ICutHistoryRepository`. The
 * authorization-aware reads (`getCutByIdAuthorized`,
 * `listCutHistoryPaginated`, `getCutAnalytics`) and the
 * `insertCutHistory(client, CutHistoryInsert)` write path remain here
 * because they need a caller-supplied `SupabaseClient` (admin / cookie-
 * bound) and / or role + identity gating that belongs in application-
 * layer use-cases. Each retires as its consumer is rewritten through a
 * use-case.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import { supabase } from "@/src/infrastructure/models/supabase"
import type { CutHistory, CutHistoryLayoutJson } from "@/src/infrastructure/models/supabase"

// Get current user's cut history
export const getCutHistory = async () => {
  const { data, error } = await supabase
    .from("cut_history")
    .select("*")
    .order("cut_date", { ascending: false })

  if (error) throw error
  return data
}

// Delete a cut history entry
export const deleteCutHistory = async (id: string) => {
  const { error } = await supabase.from("cut_history").delete().eq("id", id)

  if (error) throw error
}

// Get all cut history (admin/manager/supervisor only)
export const getAllCutHistory = async () => {
  const { data, error } = await supabase
    .from("cut_history")
    .select("*, profiles(full_name, roles)")
    .order("cut_date", { ascending: false })

  if (error) throw error
  return data
}

// ── Server-side (admin client) methods ───────────────────────────────
// These functions accept a Supabase client as their first argument so
// API routes can pass the cookie-bound auth client or the service-role
// admin client. The client is NOT the browser singleton — that one is
// only valid client-side.

export class CutNotFoundError extends Error {
  constructor() {
    super("Cut record not found")
    this.name = "CutNotFoundError"
  }
}

export class CutForbiddenError extends Error {
  constructor() {
    super("Forbidden")
    this.name = "CutForbiddenError"
  }
}

const PRIVILEGED_VIEW_ROLES = new Set(["admin", "manager", "supervisor"])
const PRIVILEGED_DELETE_ROLES = new Set(["admin", "manager"])

function isPrivilegedView(roles: readonly string[]): boolean {
  return roles.some((r) => PRIVILEGED_VIEW_ROLES.has(r))
}

function isPrivilegedDelete(roles: readonly string[]): boolean {
  return roles.some((r) => PRIVILEGED_DELETE_ROLES.has(r))
}

/**
 * Fetches a cut by id and authorizes the caller. Privileged roles
 * (admin/manager/supervisor) can view any record; other users can only
 * view records they own. Throws `CutNotFoundError` / `CutForbiddenError`
 * so the route handler can map to 404 / 403.
 */
export async function getCutByIdAuthorized(
  client: SupabaseClient,
  cutId: string,
  requesterUserId: string,
  requesterRoles: readonly string[]
): Promise<CutHistory> {
  const { data: cut, error } = await client
    .from("cut_history")
    .select("*")
    .eq("id", cutId)
    .maybeSingle()

  if (error) {
    console.error("cut_history GET error:", error)
    throw error
  }
  if (!cut) throw new CutNotFoundError()

  const isOwner = (cut as { user_id: string | null }).user_id === requesterUserId
  if (!isOwner && !isPrivilegedView(requesterRoles)) {
    throw new CutForbiddenError()
  }

  return cut as CutHistory
}

/**
 * Authorize-then-delete. admin/manager can delete any record; cutters
 * can delete only records they own; everyone else is forbidden. Throws
 * the same domain errors as `getCutByIdAuthorized`.
 */
export async function deleteCutByIdAuthorized(
  client: SupabaseClient,
  cutId: string,
  requesterUserId: string,
  requesterRoles: readonly string[]
): Promise<void> {
  const { data: cut, error: fetchError } = await client
    .from("cut_history")
    .select("id, user_id")
    .eq("id", cutId)
    .maybeSingle()

  if (fetchError) {
    console.error("cut_history delete fetch error:", fetchError)
    throw fetchError
  }
  if (!cut) throw new CutNotFoundError()

  const isOwner = (cut as { user_id: string | null }).user_id === requesterUserId
  const isCutter = requesterRoles.includes("cutter")
  if (!isPrivilegedDelete(requesterRoles) && !(isCutter && isOwner)) {
    throw new CutForbiddenError()
  }

  const { error } = await client.from("cut_history").delete().eq("id", cutId)
  if (error) {
    console.error("cut_history delete error:", error)
    throw new Error("Failed to delete cut record")
  }
}

export interface CutHistoryListParams {
  page: number
  limit: number
  from: string | null
  to: string | null
  filterUserId: string | null
  requesterUserId: string
  requesterRoles: readonly string[]
}

export interface CutHistoryListResult {
  data: CutHistory[]
  total: number
}

/**
 * Paginated cut-history listing with privilege scoping. Privileged
 * roles see all rows (optionally narrowed by `filterUserId`);
 * non-privileged users always see only their own.
 */
export async function listCutHistoryPaginated(
  client: SupabaseClient,
  params: CutHistoryListParams
): Promise<CutHistoryListResult> {
  const isPrivileged = isPrivilegedView(params.requesterRoles)
  const offset = (params.page - 1) * params.limit
  let query = client
    .from("cut_history")
    .select("*", { count: "exact" })
    .order("cut_date", { ascending: false })
    .range(offset, offset + params.limit - 1)

  if (isPrivileged && params.filterUserId !== null) {
    query = query.eq("user_id", params.filterUserId)
  } else if (!isPrivileged) {
    query = query.eq("user_id", params.requesterUserId)
  }
  if (params.from !== null) query = query.gte("cut_date", params.from)
  if (params.to !== null) query = query.lte("cut_date", params.to)

  const { data, error, count } = await query
  if (error) {
    console.error("listCutHistoryPaginated query error:", error)
    throw error
  }
  return { data: (data ?? []) as CutHistory[], total: count ?? 0 }
}

export type CutHistoryInsert = Omit<CutHistory, "id" | "created_at" | "updated_at" | "cut_date"> & {
  user_id: string
  /**
   * Optional client-supplied row id. The "PDF first, INSERT second"
   * save flow uses this to keep the storage filename
   * (`<userId>/<id>.pdf`) aligned with the eventual row id, so a
   * periodic orphan-PDF sweep can match files to rows. Falls back to
   * the column DEFAULT (`gen_random_uuid()`) when omitted.
   */
  id?: string
}

/**
 * Insert a cut_history row using the admin client. Returns the newly
 * inserted row. Surfaces the Supabase error verbatim so the route can
 * map specific PG codes (e.g. FK violation) to user-friendly toasts.
 */
export async function insertCutHistory(
  client: SupabaseClient,
  insert: CutHistoryInsert
): Promise<CutHistory> {
  const { data, error } = await client.from("cut_history").insert(insert).select().single()
  if (error) {
    console.error("cut_history insert error:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    })
    throw error
  }
  return data as CutHistory
}

/**
 * Returns a cut row by id with no authorization gate. For admin-only
 * helpers (e.g., the PDF-regeneration server helper) where the caller
 * has already established trust at a higher level. Throws
 * `CutNotFoundError` if the id doesn't exist.
 */
export async function getCutByIdRaw(
  client: SupabaseClient,
  cutId: string
): Promise<CutHistory & { layout_json?: CutHistoryLayoutJson | null }> {
  const { data, error } = await client.from("cut_history").select("*").eq("id", cutId).maybeSingle()

  if (error) {
    console.error("cut_history raw fetch error:", error)
    throw error
  }
  if (!data) throw new CutNotFoundError()
  return data as CutHistory & { layout_json?: CutHistoryLayoutJson | null }
}

export interface CutAnalyticsParams {
  from: string
  to: string | null
  requesterUserId: string
  requesterRoles: readonly string[]
  filterUserId: string | null
}

const ANALYTICS_MAX_ROWS = 10000

/**
 * Date-range cut-history rows for the analytics dashboard. Privileged
 * users (admin/manager/supervisor) see all rows in range, optionally
 * narrowed to a specific user via `filterUserId`. Non-privileged users
 * always see only their own rows regardless of `filterUserId`.
 *
 * Cap of 10k rows per call mirrors the pre-refactor route — the page
 * shows aggregated time-series, not paginated lists, so a higher cap
 * doesn't add value.
 */
export async function getCutAnalytics(
  client: SupabaseClient,
  params: CutAnalyticsParams
): Promise<CutHistory[]> {
  const isPrivileged = isPrivilegedView(params.requesterRoles)
  let query = client
    .from("cut_history")
    .select("*")
    .gte("cut_date", params.from)
    .order("cut_date", { ascending: true })
    .limit(ANALYTICS_MAX_ROWS)

  if (params.to !== null) {
    query = query.lte("cut_date", params.to)
  }
  if (isPrivileged && params.filterUserId !== null) {
    query = query.eq("user_id", params.filterUserId)
  } else if (!isPrivileged) {
    query = query.eq("user_id", params.requesterUserId)
  }

  const { data, error } = await query
  if (error) {
    console.error("getCutAnalytics query error:", error)
    throw error
  }
  return (data ?? []) as CutHistory[]
}

/**
 * Idempotent PDF regeneration: if the cut already has a `pdf_url`,
 * returns it. Otherwise the caller is expected to actually regenerate
 * the PDF; this helper just owns the lookup-or-return-existing logic
 * so routes don't repeat it.
 */
export async function getExistingCutPdfUrl(
  client: SupabaseClient,
  cutId: string
): Promise<string | null> {
  const { data, error } = await client
    .from("cut_history")
    .select("pdf_url")
    .eq("id", cutId)
    .maybeSingle()

  if (error) {
    console.error("cut_history pdf-url lookup error:", error)
    return null
  }
  return ((data as { pdf_url: string | null } | null)?.pdf_url ?? null) || null
}
