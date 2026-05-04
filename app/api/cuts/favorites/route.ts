import { type NextRequest, NextResponse } from "next/server"

import { makeAdminClient, makeAuthClient } from "@/app/api/_lib/supabase-server"
import { cutFavoritesService } from "@/src/infrastructure/services/cutFavoritesService"

export async function GET(request: NextRequest) {
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

  const db = makeAdminClient()
  if (!db) {
    return NextResponse.json(
      { error: "Server configuration error: SUPABASE_SERVICE_ROLE_KEY is not set" },
      { status: 503 }
    )
  }

  const ids = await cutFavoritesService.listFavorites(db, user.id)
  return NextResponse.json({ data: ids })
}

interface ToggleBody {
  cut_history_id: string
}

export async function POST(request: NextRequest) {
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

  const db = makeAdminClient()
  if (!db) {
    return NextResponse.json(
      { error: "Server configuration error: SUPABASE_SERVICE_ROLE_KEY is not set" },
      { status: 503 }
    )
  }

  let body: ToggleBody
  try {
    body = (await request.json()) as ToggleBody
  } catch (_error) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { cut_history_id } = body
  if (typeof cut_history_id !== "string") {
    return NextResponse.json({ error: "cut_history_id must be a string" }, { status: 400 })
  }

  const result = await cutFavoritesService.toggleFavorite(db, user.id, cut_history_id)
  if ("error" in result) {
    return NextResponse.json({ isFavorite: true, error: result.error }, { status: 500 })
  }
  return NextResponse.json(result)
}
