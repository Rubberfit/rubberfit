import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/app/api/admin/_lib/require-admin"
import type { AppRole } from "@/src/application/permissions"
import { createUserWithProfile } from "@/src/infrastructure/services/userManagementService"

function isValidRole(role: unknown): role is AppRole {
  return (
    role === "admin" ||
    role === "cutter" ||
    role === "manager" ||
    role === "member" ||
    role === "supervisor" ||
    role === "viewer"
  )
}

/** POST /api/admin/users — create a new auth user + profile */
export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request)
  if (!guard.ok) return guard.response
  const { adminClient } = guard.ctx

  let body: unknown
  try {
    body = await request.json()
  } catch (_error) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const { email, password, full_name, roles } = body as Record<string, unknown>

  if (typeof email !== "string" || !email.trim()) {
    return NextResponse.json({ error: "email is required" }, { status: 400 })
  }
  if (typeof password !== "string" || password.length < 6) {
    return NextResponse.json({ error: "password must be at least 6 characters" }, { status: 400 })
  }
  if (typeof full_name !== "string" || !full_name.trim()) {
    return NextResponse.json({ error: "full_name is required" }, { status: 400 })
  }

  const resolvedRoles: AppRole[] =
    Array.isArray(roles) && roles.length > 0 && roles.every(isValidRole)
      ? (roles as AppRole[])
      : ["member"]

  let result: Awaited<ReturnType<typeof createUserWithProfile>>
  try {
    result = await createUserWithProfile(adminClient, {
      email,
      password,
      fullName: full_name,
      roles: resolvedRoles,
    })
  } catch (error) {
    console.error("POST /api/admin/users:", error)
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 })
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  if (result.warning) {
    return NextResponse.json(
      { success: true, userId: result.userId, warning: result.warning },
      { status: 201 }
    )
  }
  return NextResponse.json({ success: true, userId: result.userId }, { status: 201 })
}
