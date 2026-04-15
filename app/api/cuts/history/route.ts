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

interface RecordCutBody {
  material_id: number
  part_id: number
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

  const insert: Omit<CutHistory, "id" | "created_at" | "updated_at" | "cut_date"> & {
    user_id: string
  } = {
    user_id: user.id,
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
    console.error("cut_history insert error:", error)
    return NextResponse.json({ error: "Failed to record cut" }, { status: 500 })
  }

  return NextResponse.json({ data: data as CutHistory }, { status: 201 })
}
