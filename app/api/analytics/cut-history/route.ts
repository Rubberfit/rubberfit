import { type NextRequest, NextResponse } from "next/server"

import { makeAdminClient, makeAuthClient } from "@/app/api/_lib/supabase-server"
import { TOKENS } from "@/di/tokens"
import { resolveUseCase } from "@/di/resolve"
import type { IGetCutAnalyticsUseCase } from "@/src/application/use-cases/cut-history/get-cut-analytics.use-case"
import { getProfileAccess } from "@/src/infrastructure/services/authService"

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

  try {
    const { roles } = await getProfileAccess(db, user.id)
    const useCase = resolveUseCase<IGetCutAnalyticsUseCase>(TOKENS.IGetCutAnalyticsUseCase)
    const data = await useCase.execute({
      client: db,
      from,
      to,
      requesterUserId: user.id,
      requesterRoles: roles,
      filterUserId,
    })
    return NextResponse.json({ data })
  } catch (err) {
    console.error("analytics cut_history query error:", err)
    return NextResponse.json({ error: "Failed to fetch analytics data" }, { status: 500 })
  }
}
