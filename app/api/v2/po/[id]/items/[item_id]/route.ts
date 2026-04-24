import { type NextRequest } from "next/server"

import { forwardToRust } from "@/app/api/v2/_lib/bridge"

type Params = Promise<{ id: string; item_id: string }>

export async function PUT(request: NextRequest, ctx: { params: Params }) {
  const { id, item_id } = await ctx.params
  return forwardToRust(request, {
    path: `/api/v2/po/${encodeURIComponent(id)}/items/${encodeURIComponent(item_id)}`,
  })
}

export async function DELETE(request: NextRequest, ctx: { params: Params }) {
  const { id, item_id } = await ctx.params
  return forwardToRust(request, {
    path: `/api/v2/po/${encodeURIComponent(id)}/items/${encodeURIComponent(item_id)}`,
  })
}
