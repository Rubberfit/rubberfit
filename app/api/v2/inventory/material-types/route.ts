import { type NextRequest } from "next/server"

import { forwardToRust } from "@/app/api/v2/_lib/bridge"

export async function GET(request: NextRequest) {
  return forwardToRust(request, { path: "/api/v2/inventory/material-types" })
}

export async function POST(request: NextRequest) {
  return forwardToRust(request, { path: "/api/v2/inventory/material-types" })
}
