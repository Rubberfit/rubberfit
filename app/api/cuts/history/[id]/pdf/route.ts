import { type NextRequest, NextResponse } from "next/server"

import { makeAdminClient, makeAuthClient } from "@/app/api/_lib/supabase-server"
import { extractAutoLayouts, generateAndStoreCutPdf } from "@/app/api/_lib/cut-pdf-server"
import { TOKENS } from "@/di/tokens"
import { resolveUseCase } from "@/di/resolve"
import { CutForbiddenError, CutNotFoundError } from "@/src/entities/errors/cut-history.errors"
import type { IGetCutByIdUseCase } from "@/src/application/use-cases/cut-history/get-cut-by-id.use-case"
import { getProfileAccess } from "@/src/infrastructure/services/authService"

/**
 * On-demand PDF generation for a cut history row.
 *
 * The save-time path (page.tsx → buildAndUploadCutPdf) generates and uploads
 * the PDF asynchronously after the row is inserted. That path can fail
 * silently when the browser navigates away mid-upload, the network blips,
 * or storage rejects the upload (issue #127). When that happens, the row
 * lingers with `pdf_url = null` forever and the history table hides the
 * View PDF button.
 *
 * This route is the recovery: callers POST here when they want the PDF for
 * a row that has none. We:
 *   1. Return the existing `pdf_url` if the row already has one (idempotent).
 *   2. Otherwise, regenerate from the persisted `layout_json.layouts` snapshot
 *      (auto-nest rows since issue #126) and write the URL back to the row.
 *   3. 422 if there's no recoverable layout (manual rows pre-#126 or rows
 *      whose layout_json is missing).
 *
 * Authorization mirrors GET `/api/cuts/history/[id]`: the caller must own the
 * row or hold a privileged role (admin / manager / supervisor).
 */
// Force Node runtime — jsPDF needs Node APIs (Buffer + base64 decoding for the
// embedded logo). Edge runtime would crash at module load.
export const runtime = "nodejs"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  let cutRow
  try {
    const { roles } = await getProfileAccess(db, user.id)
    const useCase = resolveUseCase<IGetCutByIdUseCase>(TOKENS.IGetCutByIdUseCase)
    cutRow = await useCase.execute({
      client: db,
      cutId,
      requesterUserId: user.id,
      requesterRoles: roles,
    })
  } catch (err) {
    if (err instanceof CutNotFoundError) {
      return NextResponse.json({ error: "Cut record not found" }, { status: 404 })
    }
    if (err instanceof CutForbiddenError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    throw err
  }

  if (cutRow.pdf_url) {
    return NextResponse.json({ url: cutRow.pdf_url, regenerated: false })
  }

  const layouts = extractAutoLayouts(cutRow.layout_json)
  if (!layouts) {
    return NextResponse.json(
      {
        error:
          "PDF cannot be regenerated for this cut. The layout snapshot was not stored at save time.",
      },
      { status: 422 }
    )
  }

  // Generate against the row owner's storage path so the public URL stays
  // stable across regenerations (admin/manager regen still writes under the
  // owner's prefix, not the requester's).
  const ownerId = cutRow.user_id ?? user.id

  let url: string | null = null
  try {
    url = await generateAndStoreCutPdf(db, cutRow, ownerId, layouts)
  } catch (err) {
    console.error(`PDF regeneration failed for cut ${cutId}:`, err)
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 })
  }

  if (!url) {
    return NextResponse.json({ error: "Failed to upload generated PDF" }, { status: 500 })
  }

  return NextResponse.json({ url, regenerated: true })
}
