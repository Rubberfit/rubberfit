import { type NextRequest, NextResponse } from "next/server"

import { makeAdminClient, makeAuthClient } from "@/app/api/_lib/supabase-server"
import { TOKENS } from "@/di/tokens"
import { resolveUseCase } from "@/di/resolve"
import { CutForbiddenError, CutNotFoundError } from "@/src/entities/errors/cut-history.errors"
import type { IGetCutByIdUseCase } from "@/src/application/use-cases/cut-history/get-cut-by-id.use-case"
import type { IDeleteCutUseCase } from "@/src/application/use-cases/cut-history/delete-cut.use-case"
import { getProfileAccess } from "@/src/infrastructure/services/authService"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const { id: cutId } = await params

  if (!cutId) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 })
  }

  try {
    const { roles } = await getProfileAccess(db, user.id)
    const useCase = resolveUseCase<IGetCutByIdUseCase>(TOKENS.IGetCutByIdUseCase)
    const cut = await useCase.execute({
      client: db,
      cutId,
      requesterUserId: user.id,
      requesterRoles: roles,
    })
    return NextResponse.json({ data: cut }, { status: 200 })
  } catch (err) {
    if (err instanceof CutNotFoundError) {
      return NextResponse.json({ error: "Cut record not found" }, { status: 404 })
    }
    if (err instanceof CutForbiddenError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    throw err
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id: cutId } = await params

  if (!cutId) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 })
  }

  try {
    const { roles } = await getProfileAccess(db, user.id)
    const useCase = resolveUseCase<IDeleteCutUseCase>(TOKENS.IDeleteCutUseCase)
    await useCase.execute({
      client: db,
      cutId,
      requesterUserId: user.id,
      requesterRoles: roles,
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof CutNotFoundError) {
      return NextResponse.json({ error: "Cut record not found" }, { status: 404 })
    }
    if (err instanceof CutForbiddenError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    return NextResponse.json({ error: "Failed to delete cut record" }, { status: 500 })
  }
}
