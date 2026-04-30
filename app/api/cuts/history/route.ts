import "reflect-metadata"
import { type NextRequest, NextResponse } from "next/server"

import { makeAdminClient, makeAuthClient } from "@/app/api/_lib/supabase-server"
import { resolveUseCase } from "@/di/resolve"
import { TOKENS } from "@/di/tokens"
import type {
  IRecordCutUseCase,
  RecordCutInput,
} from "@/src/application/use-cases/cuts/record-cut.use-case"
import { listCutHistoryPaginated } from "@/src/infrastructure/services/cutHistoryService"
import { getProfileAccess } from "@/src/infrastructure/services/authService"

const MAX_LIMIT = 100
const DEFAULT_LIMIT = 20

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

  try {
    const { roles } = await getProfileAccess(db, user.id)
    const result = await listCutHistoryPaginated(db, {
      page,
      limit,
      from,
      to,
      filterUserId,
      requesterUserId: user.id,
      requesterRoles: roles,
    })
    return NextResponse.json({
      data: result.data,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    })
  } catch (_err) {
    return NextResponse.json({ error: "Failed to fetch cut history" }, { status: 500 })
  }
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

  let body: RecordCutInput
  try {
    body = (await request.json()) as RecordCutInput
  } catch (_error) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  // Make sure DI registrations are loaded before resolving the use-case.
  await import("@/di/di-registration")
  const useCase = resolveUseCase<IRecordCutUseCase>(TOKENS.IRecordCutUseCase)
  const result = await useCase.execute(db, body, user.id)

  if (!result.ok) {
    if (result.status === 400) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    return NextResponse.json(
      {
        error: result.error,
        detail: result.detail,
        code: result.code,
      },
      { status: result.status }
    )
  }

  return NextResponse.json({ data: result.cut }, { status: 201 })
}
