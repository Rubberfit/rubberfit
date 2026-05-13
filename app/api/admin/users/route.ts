import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireAdmin } from "@/app/api/admin/_lib/require-admin"
import { ALL_ROLES, type AppRole } from "@/src/application/permissions"
import { createUserWithProfile } from "@/src/infrastructure/services/userManagementService"
import { resolveActiveTenantId } from "@/src/infrastructure/services/active-tenant.service"

// .strict() rejects unknown keys with a 400 (ARC-137 / V8.2.3) — the
// highest-impact mass-assignment guard in the codebase: a request
// sending `super_admin: true` or any Postgres column name now 400s
// rather than silently flowing into the user-creation pipeline. The
// authenticated caller is already an admin (requireAdmin), but
// `.strict()` constrains what *fields* admins can write through this
// route — the principle of least surface for mass-assignment.
const createUserBodySchema = z
  .object({
    email: z.string().trim().email({ message: "email must be a valid address" }),
    password: z.string().min(6, { message: "password must be at least 6 characters" }),
    full_name: z.string().trim().min(1, { message: "full_name is required" }),
    // Role policy is V6/Phase C territory; min(6) matches the historical
    // check (pre-ARC-141), and tightening it is ARC-145's job.
    roles: z.array(z.enum(ALL_ROLES)).optional(),
  })
  .strict()

/** POST /api/admin/users — create a new auth user + profile + membership */
export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request)
  if (!guard.ok) return guard.response
  const { adminClient, userId: callerId } = guard.ctx

  let raw: unknown
  try {
    raw = await request.json()
  } catch (_error) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = createUserBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", issues: parsed.error.issues },
      { status: 400 }
    )
  }
  const { email, password, full_name, roles } = parsed.data
  const resolvedRoles: AppRole[] = roles && roles.length > 0 ? roles : ["member"]

  // Resolve target tenant: caller's last_active_tenant_id else their
  // oldest active membership. Interim until step 3 wires activeTenantId
  // onto the actor.
  let tenantId: string | null
  try {
    tenantId = await resolveActiveTenantId(adminClient, callerId)
  } catch (error) {
    console.error("POST /api/admin/users: tenant resolution failed:", error)
    return NextResponse.json({ error: "Failed to resolve active tenant" }, { status: 500 })
  }
  if (!tenantId) {
    return NextResponse.json(
      { error: "No active tenant — cannot create a user without a tenant membership" },
      { status: 400 }
    )
  }

  let result: Awaited<ReturnType<typeof createUserWithProfile>>
  try {
    result = await createUserWithProfile(adminClient, {
      email,
      password,
      fullName: full_name,
      roles: resolvedRoles,
      tenantId,
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
