import { type NextRequest, NextResponse } from "next/server"

import type { CutHistory } from "@/src/entities"
import { makeAdminClient, makeAuthClient } from "@/app/api/_lib/supabase-server"
import { getUserRoles } from "@/src/infrastructure/services/getUserRoles"

const MAX_ROWS = 10000

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

  // Resolve caller's role
  const callerRoles = await getUserRoles(db, user.id)
  const isPrivileged =
    callerRoles.includes("admin") ||
    callerRoles.includes("manager") ||
    callerRoles.includes("supervisor")

  // Parse query params
  const { searchParams } = new URL(request.url)
  const from = searchParams.get("from")
  const to = searchParams.get("to")
  const filterUserId = searchParams.get("userId")

  if (!from || isNaN(Date.parse(from))) {
    return NextResponse.json(
      { error: "Missing or invalid from: must be a valid ISO date string" },
      { status: 400 }
    )
  }

  if (to !== null && isNaN(Date.parse(to))) {
    return NextResponse.json(
      { error: "Invalid to: must be a valid ISO date string" },
      { status: 400 }
    )
  }

  // Build query — return all rows in range for analytics (capped at MAX_ROWS)
  let query = db
    .from("cut_history")
    .select("*")
    .gte("cut_date", from)
    .order("cut_date", { ascending: true })
    .limit(MAX_ROWS)

  if (to !== null) {
    query = query.lte("cut_date", to)
  }

  // Authorization: privileged users may scope to a specific user or see all;
  // non-privileged users always see only their own records.
  if (isPrivileged && filterUserId !== null) {
    query = query.eq("user_id", filterUserId)
  } else if (!isPrivileged) {
    query = query.eq("user_id", user.id)
  }

  const { data, error } = await query

  if (error) {
    console.error("analytics cut_history query error:", error)
    return NextResponse.json({ error: "Failed to fetch analytics data" }, { status: 500 })
  }

  return NextResponse.json({ data: (data ?? []) as CutHistory[] })
}
