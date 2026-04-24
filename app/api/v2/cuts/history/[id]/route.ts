import { type NextRequest, NextResponse } from "next/server"

import { forwardToRust } from "@/app/api/v2/_lib/bridge"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!/^\d+$/.test(id)) {
    return NextResponse.json(
      { error: "Invalid id: must be an integer" },
      { status: 400 }
    )
  }
  return forwardToRust(request, { path: `/api/v2/cuts/history/${id}` })
}
