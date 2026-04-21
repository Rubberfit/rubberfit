import { type NextRequest, NextResponse } from "next/server"

import { makeAuthClient } from "@/app/api/_lib/supabase-server"
import { getUserRoles } from "@/src/infrastructure/services/getUserRoles"

/** GET /api/users
 *  Returns a list of users (id + full_name) for the admin / manager / supervisor dropdown.
 *  Restricted to callers who hold one of those three roles.
 *  Response: { data: { id: string; full_name: string | null }[] }
 */
export async function GET(request: NextRequest) {
  const supabase = makeAuthClient(request)
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase environment variables are missing" },
      { status: 503 }
    )
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const roles = await getUserRoles(supabase, user.id)
  const isPrivileged =
    roles.includes("admin") || roles.includes("manager") || roles.includes("supervisor")

  if (!isPrivileged) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .order("full_name", { ascending: true })

  if (error) {
    console.error("users GET error:", error)
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 })
  }

  return NextResponse.json({
    data: (data ?? []) as { id: string; full_name: string | null; email: string | null }[],
  })
}
