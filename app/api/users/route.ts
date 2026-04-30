import { type NextRequest, NextResponse } from "next/server"

import { makeAdminClient, makeAuthClient } from "@/app/api/_lib/supabase-server"
import { listDirectoryUsers } from "@/src/infrastructure/services/userManagementService"
import { getProfileAccess } from "@/src/infrastructure/services/authService"

/** GET /api/users
 *  Returns a list of users (id + full_name + email) for the admin /
 *  manager / supervisor dropdown. Restricted to callers who hold one
 *  of those three roles.
 */
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

  let access
  try {
    access = await getProfileAccess(db, user.id)
  } catch (err) {
    console.error("users GET profile fetch error:", err)
    return NextResponse.json({ error: "Failed to fetch user profile" }, { status: 500 })
  }

  const isPrivileged =
    access.roles.includes("admin") ||
    access.roles.includes("manager") ||
    access.roles.includes("supervisor")

  if (!isPrivileged) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const data = await listDirectoryUsers(db)
    return NextResponse.json({ data })
  } catch (err) {
    console.error("users GET error:", err)
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 })
  }
}
