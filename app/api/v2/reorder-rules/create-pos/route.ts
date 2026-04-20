import { type NextRequest } from "next/server"

import { forwardToRust } from "@/app/api/v2/_lib/bridge"

export async function POST(request: NextRequest) {
  return forwardToRust(request, { path: "/api/v2/reorder-rules/create-pos" })
}
