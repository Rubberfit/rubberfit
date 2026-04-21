import { type NextRequest, NextResponse } from "next/server"

import type { CutHistory, PartCustomDimensions } from "@/src/infrastructure/models/supabase"
import { makeAdminClient, makeAuthClient } from "@/app/api/_lib/supabase-server"

const MAX_LIMIT = 100
const DEFAULT_LIMIT = 20

export async function GET(request: NextRequest) {
  //  Authenticate caller
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

  //  DB client (service role — bypasses RLS)
  const db = makeAdminClient()
  if (!db) {
    return NextResponse.json(
      { error: "Server configuration error: SUPABASE_SERVICE_ROLE_KEY is not set" },
      { status: 503 }
    )
  }

  //  Resolve caller's role
  const { data: callerProfile } = await db
    .from("profiles")
    .select("roles")
    .eq("id", user.id)
    .single()

  const callerRoles: string[] = (callerProfile?.roles as string[] | null) ?? []
  const isPrivileged =
    callerRoles.includes("admin") ||
    callerRoles.includes("manager") ||
    callerRoles.includes("supervisor")

  //  Parse & validate query params
  const { searchParams } = new URL(request.url)

  const rawPage = searchParams.get("page") ?? "1"
  const rawLimit = searchParams.get("limit") ?? String(DEFAULT_LIMIT)
  const from = searchParams.get("from")
  const to = searchParams.get("to")
  const filterUserId = searchParams.get("userId")

  const page = parseInt(rawPage, 10)
  const limit = parseInt(rawLimit, 10)

  if (isNaN(page) || page < 1) {
    return NextResponse.json({ error: "Invalid page: must be a positive integer" }, { status: 400 })
  }

  if (isNaN(limit) || limit < 1 || limit > MAX_LIMIT) {
    return NextResponse.json(
      { error: `Invalid limit: must be between 1 and ${MAX_LIMIT}` },
      { status: 400 }
    )
  }

  if (from !== null && isNaN(Date.parse(from))) {
    return NextResponse.json(
      { error: "Invalid from: must be a valid ISO date string" },
      { status: 400 }
    )
  }

  if (to !== null && isNaN(Date.parse(to))) {
    return NextResponse.json(
      { error: "Invalid to: must be a valid ISO date string" },
      { status: 400 }
    )
  }

  const offset = (page - 1) * limit

  //  Build query
  let query = db
    .from("cut_history")
    .select("*", { count: "exact" })
    .order("cut_date", { ascending: false })
    .range(offset, offset + limit - 1)

  // Authorization: privileged users may scope to a specific user or see all;
  // non-privileged users always see only their own records (enforced in code,
  // independent of RLS policy state).
  if (isPrivileged && filterUserId !== null) {
    query = query.eq("user_id", filterUserId)
  } else if (!isPrivileged) {
    query = query.eq("user_id", user.id)
  }

  if (from !== null) {
    query = query.gte("cut_date", from)
  }

  if (to !== null) {
    query = query.lte("cut_date", to)
  }

  const { data, error, count } = await query

  if (error) {
    console.error("cut_history query error:", error)
    return NextResponse.json({ error: "Failed to fetch cut history" }, { status: 500 })
  }

  const total = count ?? 0

  return NextResponse.json({
    data: (data ?? []) as CutHistory[],
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  })
}

interface OffcutPiecePayload {
  width_in: number
  length_in: number
}

interface RecordCutBody {
  material_id: number
  part_id: number
  /**
   * Optional source-roll id — set when the operator opened the
   * engine via `?loadRoll=<id>` from the inventory drawer or when
   * a material was selected and auto-resolved to a roll. Null for
   * general-cutter usage (no inventory impact).
   */
  roll_id?: string | null
  /**
   * Optional job id — set when the engine was opened via
   * `?loadJob=<id>` from a job drawer. Stamped onto
   * `cut_history.job_id` so the job's "Cuts recorded" panel can
   * list the record.
   */
  job_id?: string | null
  /**
   * Per-piece reusable offcut geometry coming from the engine. One
   * inventory row is spawned per entry, sharing the parent roll's
   * material / thickness / supplier metadata. Empty or missing =
   * no offcut spawning (general cutter or zero-waste layout).
   */
  offcut_pieces?: OffcutPiecePayload[]
  cut_length: number
  cut_width: number
  cut_thickness: number
  cut_amount: number
  part_custom_width?: number | null
  part_custom_height?: number | null
  part_custom_dimensions?: PartCustomDimensions[] | null
  part_selected_size?: number[]
  part_selected_size_text?: string[]
  part_selected_label?: string[]
  parts_completed: number
  cut_pieces: number
  material_used_sqft: number
  reusable_offset_sqft: number
  scrap_sqft: number
  fab_score: number
  stock_label?: string | null
  cost_per_sqft?: number | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  //  Authenticate caller
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

  //  DB client (service role)
  const db = makeAdminClient()
  if (!db) {
    return NextResponse.json(
      { error: "Server configuration error: SUPABASE_SERVICE_ROLE_KEY is not set" },
      { status: 503 }
    )
  }

  let body: RecordCutBody
  try {
    body = (await request.json()) as RecordCutBody
  } catch (_error) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const {
    material_id,
    part_id,
    cut_length,
    cut_width,
    cut_thickness,
    cut_amount,
    parts_completed,
    cut_pieces,
    material_used_sqft,
    reusable_offset_sqft,
    scrap_sqft,
    fab_score,
  } = body

  // Non-negative floats (>= 0, finite)
  const nonNegativeFields: Record<string, unknown> = {
    cut_length,
    cut_width,
    cut_thickness,
    material_used_sqft,
    reusable_offset_sqft,
    scrap_sqft,
    fab_score,
  }

  // Positive integers (>= 1, whole number)
  const positiveIntFields: Record<string, unknown> = {
    material_id,
    part_id,
    cut_amount,
    parts_completed,
    cut_pieces,
  }

  for (const [key, val] of Object.entries(nonNegativeFields)) {
    if (typeof val !== "number" || !isFinite(val) || val < 0) {
      return NextResponse.json(
        { error: `Missing or invalid required field: ${key}` },
        { status: 400 }
      )
    }
  }

  for (const [key, val] of Object.entries(positiveIntFields)) {
    if (typeof val !== "number" || !Number.isInteger(val) || val < 1) {
      return NextResponse.json(
        { error: `Missing or invalid required field: ${key}` },
        { status: 400 }
      )
    }
  }

  const r2 = (n: number) => Math.round(n * 100) / 100

  const rollId =
    typeof body.roll_id === "string" && UUID_RE.test(body.roll_id) ? body.roll_id : null
  const jobId =
    typeof body.job_id === "string" && UUID_RE.test(body.job_id) ? body.job_id : null

  // Only include roll_id in the insert payload when the column is
  // populated — Supabase will reject the insert if the column
  // doesn't exist on the target table (e.g. migration not yet
  // applied). Omitting the key keeps legacy environments working
  // until the migration lands.
  const insert: Omit<CutHistory, "id" | "created_at" | "updated_at" | "cut_date"> & {
    user_id: string
  } = {
    user_id: user.id,
    roll_id: rollId,
    job_id: jobId,
    // Line-level linking (cut_history.job_part_id) is reserved for
    // a future per-line fulfilment flow; stays null on inserts today.
    job_part_id: null,
    material_id,
    part_id,
    cut_length: r2(cut_length),
    cut_width: r2(cut_width),
    cut_thickness: r2(cut_thickness),
    cut_amount,
    parts_completed,
    cut_pieces,
    material_used_sqft: r2(material_used_sqft),
    reusable_offset_sqft: r2(reusable_offset_sqft),
    scrap_sqft: r2(scrap_sqft),
    fab_score: r2(fab_score),
    part_custom_width: body.part_custom_width != null ? r2(body.part_custom_width) : null,
    part_custom_height: body.part_custom_height != null ? r2(body.part_custom_height) : null,
    part_custom_dimensions: body.part_custom_dimensions ?? null,
    part_selected_size: body.part_selected_size ?? null,
    part_selected_size_text: body.part_selected_size_text ?? null,
    part_selected_label: body.part_selected_label ?? null,
    stock_label: body.stock_label?.trim() || null,
    cost_per_sqft:
      body.cost_per_sqft != null && isFinite(body.cost_per_sqft) && body.cost_per_sqft >= 0
        ? r2(body.cost_per_sqft)
        : null,
    pdf_url: null,
  }

  const { data, error } = await db.from("cut_history").insert(insert).select().single()

  if (error) {
    console.error("cut_history insert error:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      payload: insert,
    })
    return NextResponse.json(
      {
        error: "Failed to record cut",
        // Expose the Postgres error code/hint so the client toast
        // can surface missing-column / FK-violation issues instead
        // of the bare "Failed to record cut".
        detail: error.message,
        code: error.code,
      },
      { status: 500 }
    )
  }

  // ── Post-insert inventory reconciliation ─────────────────────
  // When the cut is tied to a source roll, two side effects land:
  //   1. Parent roll's remaining_length decrements by cut_length.
  //   2. Each unit of reusable offcut (≥ 0.1 sqft) spawns a child
  //      row in `rolls` with is_offcut=true and parent_roll_id set,
  //      so the operator sees the offcut as a scannable inventory
  //      item and can consume it in a later cut.
  //
  // Best-effort and non-fatal — if either side effect errors the
  // cut_history row still returns, and the user can reconcile from
  // the inventory drawer. Stock-level triggers (see
  // 20240217000006_create_functions_and_triggers.sql) handle the
  // status transition when remaining_length hits zero.
  if (rollId) {
    const { data: rollRow } = await db
      .from("rolls")
      .select(
        "remaining_length, width, thickness, material_type, material_type_id, color, supplier, cost_per_sqft, location"
      )
      .eq("id", rollId)
      .single<{
        remaining_length: number
        width: number
        thickness: number
        material_type: string
        material_type_id: string | null
        color: string | null
        supplier: string | null
        cost_per_sqft: number | null
        location: string | null
      }>()
    if (rollRow) {
      const consumed = r2(cut_length)
      const nextRemaining = Math.max(0, r2(rollRow.remaining_length - consumed))
      const { error: updErr } = await db
        .from("rolls")
        .update({ remaining_length: nextRemaining })
        .eq("id", rollId)
      if (updErr) {
        console.error("rolls remaining_length update failed:", {
          rollId,
          consumed,
          message: updErr.message,
          code: updErr.code,
        })
      }

      // Spawn one inventory row per reusable offcut rectangle. We
      // prefer the per-piece geometry the engine emitted; if it
      // didn't (older clients, non-rectangle layouts), fall back
      // to a single strip approximation so we don't drop the
      // reusable area entirely. A cut-history id appears in the
      // notes so operators can trace an offcut back to its source
      // cut.
      const clientPieces = Array.isArray(body.offcut_pieces) ? body.offcut_pieces : []
      const validPieces = clientPieces
        .map((p) => ({
          width_in: Number(p?.width_in ?? 0),
          length_in: Number(p?.length_in ?? 0),
        }))
        .filter(
          (p) =>
            Number.isFinite(p.width_in) &&
            Number.isFinite(p.length_in) &&
            p.width_in > 0 &&
            p.length_in > 0 &&
            (p.width_in * p.length_in) / 144 >= 0.05
        )

      let piecesToInsert = validPieces
      if (piecesToInsert.length === 0) {
        const reusable = r2(reusable_offset_sqft)
        if (reusable >= 0.1 && rollRow.width > 0) {
          piecesToInsert = [
            {
              width_in: rollRow.width,
              length_in: r2((reusable * 144) / rollRow.width),
            },
          ]
        }
      }

      if (piecesToInsert.length > 0) {
        const cutIdLabel = data?.id ?? "?"
        const offcutRows = piecesToInsert.map((piece, idx) => ({
          user_id: user.id,
          parent_roll_id: rollId,
          is_offcut: true,
          material_type: rollRow.material_type,
          material_type_id: rollRow.material_type_id,
          width: r2(piece.width_in),
          length: r2(piece.length_in),
          remaining_length: r2(piece.length_in),
          thickness: rollRow.thickness,
          color: rollRow.color,
          supplier: rollRow.supplier,
          cost_per_sqft: rollRow.cost_per_sqft,
          location: rollRow.location,
          status: "active" as const,
          notes: `Reusable offcut ${idx + 1}/${piecesToInsert.length} from cut #${cutIdLabel}`,
        }))
        const { error: offcutErr } = await db.from("rolls").insert(offcutRows)
        if (offcutErr) {
          console.error("offcut spawn failed:", {
            parentRollId: rollId,
            pieceCount: piecesToInsert.length,
            message: offcutErr.message,
            code: offcutErr.code,
          })
        }
      }
    }
  }

  return NextResponse.json({ data: data as CutHistory }, { status: 201 })
}
