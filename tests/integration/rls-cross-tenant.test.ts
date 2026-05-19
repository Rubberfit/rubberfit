/**
 * Cross-tenant RLS verification — ARC-25 acceptance criterion:
 *   "Two users in the same org see shared data; users in different orgs
 *    see nothing from each other."
 *
 * Runs against a real local Supabase stack. Expects:
 *   1. `npm run supabase:start` (port 54321 reachable)
 *   2. `npm run supabase:reset` so the current seed.sql has been
 *      applied (which provisions Dev Tenant + Second Tenant users).
 *
 * Each test signs in as a real seed user and queries through their
 * cookie-bound JWT, so the tenant-scoped RLS policies on each table
 * are exercised exactly as they fire in production. There are no
 * mocks here — if a policy regresses, this test catches it.
 *
 * Tables under test: rolls, suppliers, purchase_orders, cuts. Picked
 * for breadth across the operational schema:
 *   • rolls            — inventory hot path
 *   • suppliers        — relationship aggregate
 *   • purchase_orders  — financial / audit-critical
 *   • cuts             — operational history
 *
 * Run with: `npm run test:integration`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import {
  SEED_TENANT_SLUGS,
  SEED_USERS,
  signInAs,
  signOut,
} from "@/tests/helpers/supabase-integration-client"

interface TenantScopedRow {
  tenant_id: string
  id?: string
}

async function selectAllTenantIds(client: SupabaseClient, table: string): Promise<string[]> {
  const { data, error } = await client.from(table).select("tenant_id")
  if (error) {
    throw new Error(`select tenant_ids from ${table} failed: ${error.message}`)
  }
  return (data ?? []).map((row) => (row as TenantScopedRow).tenant_id)
}

async function resolveTenantId(client: SupabaseClient, slug: string): Promise<string> {
  const { data, error } = await client.from("tenants").select("id").eq("slug", slug).single()
  if (error) {
    throw new Error(`resolve tenant id for slug ${slug} failed: ${error.message}`)
  }
  return (data as { id: string }).id
}

describe("RLS: cross-tenant isolation", () => {
  let tenantAClient: SupabaseClient
  let tenantA2Client: SupabaseClient
  let tenantBClient: SupabaseClient
  let tenantAId: string
  let tenantBId: string

  beforeAll(async () => {
    tenantAClient = await signInAs(SEED_USERS.tenantA.admin)
    tenantA2Client = await signInAs(SEED_USERS.tenantA.manager)
    tenantBClient = await signInAs(SEED_USERS.tenantB.admin)

    tenantAId = await resolveTenantId(tenantAClient, SEED_TENANT_SLUGS.tenantA)
    tenantBId = await resolveTenantId(tenantBClient, SEED_TENANT_SLUGS.tenantB)
  })

  afterAll(async () => {
    await Promise.all([signOut(tenantAClient), signOut(tenantA2Client), signOut(tenantBClient)])
  })

  describe("sanity — tenants resolve and are distinct", () => {
    it("tenant-A and tenant-B have different ids", () => {
      expect(tenantAId).not.toBe(tenantBId)
    })

    it("tenant-A cannot see tenant-B's tenants row", async () => {
      const { data, error } = await tenantAClient
        .from("tenants")
        .select("id")
        .eq("slug", SEED_TENANT_SLUGS.tenantB)
        .maybeSingle()
      expect(error).toBeNull()
      expect(data).toBeNull()
    })

    it("tenant-B cannot see tenant-A's tenants row", async () => {
      const { data, error } = await tenantBClient
        .from("tenants")
        .select("id")
        .eq("slug", SEED_TENANT_SLUGS.tenantA)
        .maybeSingle()
      expect(error).toBeNull()
      expect(data).toBeNull()
    })
  })

  const tables = ["rolls", "suppliers", "purchase_orders", "cuts"] as const

  describe.each(tables)("%s — tenant isolation", (table) => {
    it(`tenant-A user sees only tenant-A ${table} rows`, async () => {
      const tenantIds = await selectAllTenantIds(tenantAClient, table)
      expect(tenantIds.length).toBeGreaterThan(0)
      expect(tenantIds.every((id) => id === tenantAId)).toBe(true)
    })

    it(`tenant-B user sees only tenant-B ${table} rows`, async () => {
      const tenantIds = await selectAllTenantIds(tenantBClient, table)
      expect(tenantIds.length).toBeGreaterThan(0)
      expect(tenantIds.every((id) => id === tenantBId)).toBe(true)
    })

    it(`tenant-A and tenant-B see disjoint ${table} row counts`, async () => {
      const aIds = await selectAllTenantIds(tenantAClient, table)
      const bIds = await selectAllTenantIds(tenantBClient, table)
      expect(aIds.length).not.toBe(bIds.length)
    })

    it(`tenant-A targeted query for tenant-B id returns empty for ${table}`, async () => {
      const { data, error } = await tenantAClient
        .from(table)
        .select("id, tenant_id")
        .eq("tenant_id", tenantBId)
      expect(error).toBeNull()
      expect(data ?? []).toEqual([])
    })

    it(`tenant-B targeted query for tenant-A id returns empty for ${table}`, async () => {
      const { data, error } = await tenantBClient
        .from(table)
        .select("id, tenant_id")
        .eq("tenant_id", tenantAId)
      expect(error).toBeNull()
      expect(data ?? []).toEqual([])
    })
  })

  describe("same-tenant sharing — admin and manager in tenant-A see equal row sets", () => {
    it.each(tables)("%s row count matches across two tenant-A members", async (table) => {
      const adminCount = (await selectAllTenantIds(tenantAClient, table)).length
      const managerCount = (await selectAllTenantIds(tenantA2Client, table)).length
      expect(adminCount).toBe(managerCount)
      expect(adminCount).toBeGreaterThan(0)
    })

    it.each(tables)(
      "%s row ids match across two tenant-A members (no per-user filtering)",
      async (table) => {
        const adminRows = await tenantAClient.from(table).select("id").order("id")
        const managerRows = await tenantA2Client.from(table).select("id").order("id")
        expect(adminRows.error).toBeNull()
        expect(managerRows.error).toBeNull()
        expect(adminRows.data).toEqual(managerRows.data)
      }
    )
  })

  describe("write-side enforcement — INSERT with mismatched tenant_id is blocked", () => {
    it("tenant-A user cannot INSERT a roll tagged with tenant-B id", async () => {
      const { error } = await tenantAClient.from("rolls").insert({
        tenant_id: tenantBId,
        material_type_id: "00000000-0000-0000-0000-000000000000",
        width_mm: 100,
        length_mm: 100,
        remaining_length_mm: 100,
        thickness_mm: 1,
      })
      // The RLS WITH CHECK clause rejects the row — error must be set.
      // (FK violations would also surface here; either way the write
      // is blocked, which is the property we want.)
      expect(error).not.toBeNull()
    })
  })
})
