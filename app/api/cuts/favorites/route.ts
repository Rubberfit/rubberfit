import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { makeAdminClient, makeAuthClient } from "@/app/api/_lib/supabase-server"
import { cutFavoritesService } from "@/src/infrastructure/services/cutFavoritesService"

// .strict() rejects unknown keys with a 400 (ARC-137 / V8.2.3) — closes
// the mass-assignment hazard if a future column accepts a value via
// this route. Default Zod mode silently drops unknown keys; that's
// exactly the BOPLA path we don't want.
const toggleBodySchema = z
  .object({
    cut_history_id: z.string().uuid({ message: "cut_history_id must be a valid UUID" }),
  })
  .strict()

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

  let raw: unknown
  try {
    raw = await request.json()
  } catch (_error) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = toggleBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", issues: parsed.error.issues },
      { status: 400 }
    )
  }
  const { cut_history_id } = parsed.data

  const result = await cutFavoritesService.toggleFavorite(db, user.id, cut_history_id)
  if ("error" in result) {
    return NextResponse.json({ isFavorite: true, error: result.error }, { status: 500 })
  }
  return NextResponse.json(result)
}
