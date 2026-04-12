import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"

import type { CutHistoryWithProfile } from "@/src/infrastructure/models/supabase"

const MAX_LIMIT = 100
const DEFAULT_LIMIT = 20

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Supabase environment variables are missing" }, { status: 503 })
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: () => {},
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)

  const rawPage = searchParams.get("page") ?? "1"
  const rawLimit = searchParams.get("limit") ?? String(DEFAULT_LIMIT)
  const from = searchParams.get("from")
  const to = searchParams.get("to")

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
    return NextResponse.json({ error: "Invalid from: must be a valid ISO date string" }, { status: 400 })
  }

  if (to !== null && isNaN(Date.parse(to))) {
    return NextResponse.json({ error: "Invalid to: must be a valid ISO date string" }, { status: 400 })
  }

  const offset = (page - 1) * limit

  let query = supabase
    .from("cut_history")
    .select("*, profiles(full_name, roles)", { count: "exact" })
    .order("cut_date", { ascending: false })
    .range(offset, offset + limit - 1)

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
    data: (data ?? []) as CutHistoryWithProfile[],
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  })
}
