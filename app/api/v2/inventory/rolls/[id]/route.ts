import { type NextRequest, NextResponse } from "next/server"

import { forwardToRust } from "@/app/api/v2/_lib/bridge"

async function forward(
  request: NextRequest,
  params: Promise<{ id: string }>
) {
  const { id } = await params
  if (!/^[a-fA-F0-9-]+$/.test(id) || id.length > 64) {
    return NextResponse.json(
      { error: "Invalid id: must be a UUID-shaped string" },
      { status: 400 }
    )
  }
  return forwardToRust(request, {
    path: `/api/v2/inventory/rolls/${id}`,
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return forward(request, params)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return forward(request, params)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return forward(request, params)
}
