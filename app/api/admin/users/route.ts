import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/app/api/admin/_lib/require-admin"
import type { AppRole } from "@/src/application/permissions"

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
  try{
    body = await request.json();
  }catch (error) {
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

  const normalizedEmail = email.trim().toLowerCase()

  const resolvedRoles: string[] = Array.isArray(roles) && roles.every(isValidRole) ? roles : ["member"]

  const { data: existing } = await adminClient
    .from("profiles")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 })
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: full_name.trim() },
  })

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 400 })
  }

  // Update the auto-created profile with the desired name + roles
  const { error: profileError } = await adminClient
    .from("profiles")
    .update({ full_name: full_name.trim(), roles: resolvedRoles })
    .eq("id", created.user.id)

  if (profileError) {
    // User was created — log the error but don't fail the request
    console.error("Failed to update profile after user creation:", profileError)
    return NextResponse.json(
      { success: true, userId: created.user.id, warning: "User created but profile update failed" },
      { status: 201 }
    )
  }

  return NextResponse.json({ success: true, userId: created.user.id }, { status: 201 })
}
