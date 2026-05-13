"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { ensureDatabaseFactoryRegistered } from "@/app/server/database/register-factory"
import { ForbiddenError } from "@/app/server/auth/errors"
import { requireAuthenticatedUser } from "@/app/server/auth/require-authenticated-user"
import {
  ACTIVE_TENANT_COOKIE,
  buildActiveTenantCookieOptions,
} from "@/app/server/auth/active-tenant"
import {
  persistLastActiveTenant,
  verifyTenantMembership,
} from "@/src/infrastructure/services/active-tenant.service"
import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"

/**
 * Explicit tenant switch — the action behind the (step 4) chooser UI.
 *
 * Validates that the caller has an active membership in the target
 * tenant, persists `profiles.last_active_tenant_id`, writes the
 * `rema_active_tenant` cookie, and invalidates the root layout so all
 * RSC tenant-scoped data refetches. Client-side React Query caches
 * should also be invalidated by the caller (the chooser UI) once the
 * action returns; this action only owns the server-side concerns.
 *
 * Deliberately does NOT call `requireActiveTenant(actor)` — the
 * chooser is the one place where running without an active tenant
 * is legitimate (it's resolving that very state).
 */

const selectTenantSchema = z.object({
  tenantId: z.string().uuid({ message: "Invalid tenant id" }),
})

export type SelectTenantInput = z.input<typeof selectTenantSchema>

export async function selectTenant(input: SelectTenantInput): Promise<{ ok: true }> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  const parsed = selectTenantSchema.parse(input)

  const client = await getDatabaseClient()

  // Membership-validate before persisting. RLS would prevent
  // cross-tenant writes regardless, but trusting the input would
  // route the cookie + last_active_tenant_id to a tenant the user
  // can't see and surface as silent empty results everywhere.
  let isMember: boolean
  try {
    isMember = await verifyTenantMembership(client, actor.id, parsed.tenantId)
  } catch (_err) {
    throw new ForbiddenError("Tenant lookup failed")
  }
  if (!isMember) {
    throw new ForbiddenError("Not a member of that tenant")
  }

  await persistLastActiveTenant(client, actor.id, parsed.tenantId)

  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_TENANT_COOKIE, parsed.tenantId, buildActiveTenantCookieOptions())

  // Bust every cached RSC payload — different tenant = different
  // data. The "layout" arg invalidates from the root layout down,
  // which covers every dashboard surface in one call.
  revalidatePath("/", "layout")

  return { ok: true }
}
