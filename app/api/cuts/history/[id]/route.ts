import { type NextRequest, NextResponse } from "next/server"

import type { CutHistory } from "@/src/entities"
import { makeAdminClient, makeAuthClient } from "@/app/api/_lib/supabase-server"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const { id: rawId } = await params
  const cutId = parseInt(rawId, 10)

  if (isNaN(cutId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 })
  }

  //  Fetch record
  const { data: cut, error } = await db.from("cut_history").select("*").eq("id", cutId).single()

  if (error || !cut) {
    if (error) console.error("cut_history GET error:", error)
    return NextResponse.json({ error: "Cut record not found" }, { status: 404 })
  }

  //  Resolve caller role
  const { data: profile } = await db.from("profiles").select("roles").eq("id", user.id).single()

  const roles: string[] = (profile?.roles as string[] | null) ?? []
  const isPrivileged =
    roles.includes("admin") || roles.includes("manager") || roles.includes("supervisor")
  const isOwnRecord = (cut as { user_id: string | null }).user_id === user.id

  //  Authorize
  if (!isPrivileged && !isOwnRecord) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  return NextResponse.json({ data: cut as CutHistory }, { status: 200 })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id: rawId } = await params
  const cutId = parseInt(rawId, 10)

  if (isNaN(cutId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 })
  }

  //  Fetch record for ownership check
  const { data: cut, error: fetchError } = await db
    .from("cut_history")
    .select("id, user_id")
    .eq("id", cutId)
    .single()

  if (fetchError || !cut) {
    return NextResponse.json({ error: "Cut record not found" }, { status: 404 })
  }

  //  Resolve caller role
  const { data: profile } = await db.from("profiles").select("roles").eq("id", user.id).single()

  const roles: string[] = (profile?.roles as string[] | null) ?? []
  const isPrivileged = roles.includes("admin") || roles.includes("manager")
  const isOwnRecord = (cut as { user_id: string | null }).user_id === user.id
  const isCutter = roles.includes("cutter")

  //  Authorize
  if (!isPrivileged && !(isCutter && isOwnRecord)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { error } = await db.from("cut_history").delete().eq("id", cutId)

  if (error) {
    console.error("cut_history delete error:", error)
    return NextResponse.json({ error: "Failed to delete cut record" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
