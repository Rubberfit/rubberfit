import { type NextRequest } from "next/server"

import { forwardToRust } from "@/app/api/v2/_lib/bridge"

type Params = Promise<{ id: string }>

export async function GET(request: NextRequest, ctx: { params: Params }) {
  const { id } = await ctx.params
  return forwardToRust(request, { path: `/api/v2/po/${encodeURIComponent(id)}` })
}

export async function PUT(request: NextRequest, ctx: { params: Params }) {
  const { id } = await ctx.params
  return forwardToRust(request, { path: `/api/v2/po/${encodeURIComponent(id)}` })
}

export async function DELETE(request: NextRequest, ctx: { params: Params }) {
  const { id } = await ctx.params
  return forwardToRust(request, { path: `/api/v2/po/${encodeURIComponent(id)}` })
}
