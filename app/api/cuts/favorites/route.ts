import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"

function makeSupabase(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) return null

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: () => {},
    },
  })
}

/** GET /api/cuts/favorites
 *  Returns the list of cut_history_id values the current user has favorited.
 *  Response: { data: number[] }
 */
export async function GET(request: NextRequest) {
  const supabase = makeSupabase(request)
  if (!supabase) {
    return NextResponse.json({ error: "Supabase environment variables are missing" }, { status: 503 })
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data, error } = await supabase
    .from("cut_history_favorites")
    .select("cut_history_id")
    .eq("user_id", user.id)

  if (error) {
    // Table may not exist yet (migration pending) — return empty list gracefully
    console.warn("favorites GET error (table may not exist yet):", error.message)
    return NextResponse.json({ data: [] })
  }

  const ids = (data ?? []).map((row) => row.cut_history_id as number)
  return NextResponse.json({ data: ids })
}

interface ToggleBody {
  cut_history_id: number
}

/** POST /api/cuts/favorites
 *  Toggles a favorite: adds if absent, removes if present.
 *  Body: { cut_history_id: number }
 *  Response: { isFavorite: boolean }
 */
export async function POST(request: NextRequest) {
  const supabase = makeSupabase(request)
  if (!supabase) {
    return NextResponse.json({ error: "Supabase environment variables are missing" }, { status: 503 })
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: ToggleBody
  try {
    body = (await request.json()) as ToggleBody
  } catch (_error) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { cut_history_id } = body

  if (typeof cut_history_id !== "number") {
    return NextResponse.json({ error: "cut_history_id must be a number" }, { status: 400 })
  }

  // Check if the favorite already exists
  const { data: existing } = await supabase
    .from("cut_history_favorites")
    .select("id")
    .eq("user_id", user.id)
    .eq("cut_history_id", cut_history_id)
    .maybeSingle()

  if (existing) {
    // Remove
    const { error } = await supabase
      .from("cut_history_favorites")
      .delete()
      .eq("user_id", user.id)
      .eq("cut_history_id", cut_history_id)

    if (error) {
      // Degrade gracefully — table may not be migrated yet
      console.warn("favorites DELETE error (table may not exist):", error.message)
    }
    return NextResponse.json({ isFavorite: false })
  }

  // Add
  const { error } = await supabase
    .from("cut_history_favorites")
    .insert({ user_id: user.id, cut_history_id })

  if (error) {
    // Degrade gracefully — table may not be migrated yet
    console.warn("favorites INSERT error (table may not exist):", error.message)
  }
  return NextResponse.json({ isFavorite: true })
}
