import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

const VALID_ROLES = ["admin", "cutter", "manager", "member", "supervisor", "viewer"] as const

function isValidRole(role: unknown): role is (typeof VALID_ROLES)[number] {
  return typeof role === "string" && (VALID_ROLES as readonly string[]).includes(role)
}

/** Verify the caller is an authenticated admin. Returns null on success, or an error response. */
async function requireAdmin(): Promise<{ userId: string } | NextResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: "Supabase configuration is incomplete" },
      { status: 500 }
    )
  }
  const cookieStore = await cookies()

  const caller = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )

  const {
    data: { user },
  } = await caller.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: profile } = await caller
    .from("profiles")
    .select("roles")
    .eq("id", user.id)
    .single()

  const roles: unknown = profile?.roles
  if (!Array.isArray(roles) || !roles.includes("admin")) {
    return NextResponse.json({ error: "Forbidden — admin role required" }, { status: 403 })
  }

  return { userId: user.id }
}

/** POST /api/admin/users — create a new auth user + profile */
export async function POST(request: NextRequest) {
  const authResult = await requireAdmin()
  if (authResult instanceof NextResponse) return authResult

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return NextResponse.json(
      {
        error:
          "User creation is not configured. Set SUPABASE_SERVICE_ROLE_KEY in your environment.",
      },
      { status: 501 }
    )
  }

  const body: unknown = await request.json()
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

  const resolvedRoles: string[] = Array.isArray(roles) && roles.every(isValidRole) ? roles : ["member"]

  const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey)

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email: email.trim(),
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
