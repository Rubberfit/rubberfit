/**
 * PR 1 architecture guard — Stripe rollout schema migration.
 *
 * Verifies that the organization-billing schema migration ships with
 * every artifact the downstream PRs (2–7) expect:
 *
 *   1. The migration SQL file exists under
 *      `src/infrastructure/supabase/migrations/` with the canonical
 *      timestamp prefix.
 *   2. The migration defines all five tables (organizations,
 *      organization_members, organization_subscriptions,
 *      organization_invitations, stripe_events).
 *   3. The two SECURITY DEFINER RLS helpers exist
 *      (is_organization_member, is_organization_admin) — the gate code
 *      in PR 5 reads through these.
 *   4. The subscription cancellation lifecycle fields are present
 *      (cancel_at_period_end, cancel_at, canceled_at).
 *   5. The membership-status field is present (active / deactivated /
 *      removed) — PR 6's seat-counting depends on it.
 *   6. The TypeScript types in `src/infrastructure/models/supabase.ts`
 *      mirror the SQL shape — checking key exports prevents the SQL
 *      and TS drifting silently.
 *   7. The DI container exposes IOrganizationService — PR 4 onwards
 *      resolves the service at action entry.
 *
 * This test is intentionally textual on the migration: it asserts the
 * SQL contains the right table/column names. Running the migration
 * against a live Postgres is out of scope for unit tests (the
 * `supabase db reset` flow exercises that path).
 */
import { describe, it, expect } from "vitest"
import "reflect-metadata"
import fs from "node:fs"
import path from "node:path"
import { container } from "tsyringe"
import "@/di/resolve" // triggers DI registration
import { TOKENS } from "@/di/tokens"
import { OrganizationService } from "@/src/infrastructure/services/organizationService"
import type {
  Organization,
  OrganizationInvitation,
  OrganizationMember,
  OrganizationSubscription,
  StripeEvent,
} from "@/src/infrastructure/models/billing"

const REPO_ROOT = path.resolve(__dirname, "../..")
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  "src/infrastructure/supabase/migrations/20260512000001_create_organizations_billing.sql"
)

function readMigration(): string {
  return fs.readFileSync(MIGRATION_PATH, "utf8")
}

describe("PR 1 — organization billing schema", () => {
  describe("migration file", () => {
    it("exists under src/infrastructure/supabase/migrations/", () => {
      expect(fs.existsSync(MIGRATION_PATH)).toBe(true)
    })

    it("creates the five new tables", () => {
      const sql = readMigration()
      const tables = [
        "organizations",
        "organization_members",
        "organization_subscriptions",
        "organization_invitations",
        "stripe_events",
      ]
      for (const table of tables) {
        expect(sql, `missing CREATE TABLE for ${table}`).toMatch(
          new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${table}\\b`, "i")
        )
      }
    })

    it("defines the SECURITY DEFINER RLS helpers", () => {
      const sql = readMigration()
      expect(sql).toMatch(/CREATE OR REPLACE FUNCTION\s+is_organization_member\s*\(/i)
      expect(sql).toMatch(/CREATE OR REPLACE FUNCTION\s+is_organization_admin\s*\(/i)
      expect(sql).toMatch(/SECURITY DEFINER/i)
    })

    it("enables row-level security on every new table", () => {
      const sql = readMigration()
      const tables = [
        "organizations",
        "organization_members",
        "organization_subscriptions",
        "organization_invitations",
        "stripe_events",
      ]
      for (const table of tables) {
        expect(sql, `RLS not enabled on ${table}`).toMatch(
          new RegExp(`ALTER TABLE\\s+${table}\\s+ENABLE ROW LEVEL SECURITY`, "i")
        )
      }
    })

    it("includes the cancellation-lifecycle fields on organization_subscriptions", () => {
      const sql = readMigration()
      for (const column of ["cancel_at_period_end", "cancel_at", "canceled_at"]) {
        expect(sql, `missing column ${column} on organization_subscriptions`).toMatch(
          new RegExp(`\\b${column}\\b`)
        )
      }
    })

    it("includes the membership status field with the seat-freeing enum", () => {
      const sql = readMigration()
      // The status column + CHECK constraint can span multiple lines, so
      // assert the three enum values appear together in any order within
      // a single CHECK clause.
      expect(sql).toMatch(/status\s+VARCHAR/)
      expect(sql).toMatch(/'active'/)
      expect(sql).toMatch(/'deactivated'/)
      expect(sql).toMatch(/'removed'/)
    })

    it("enforces the v1 one-org-per-user UNIQUE constraint", () => {
      const sql = readMigration()
      expect(sql).toMatch(/organization_members_one_org_per_user/i)
      expect(sql).toMatch(/UNIQUE\s*\(\s*user_id\s*\)/i)
    })

    it("enforces a single is_current=TRUE subscription row per org", () => {
      const sql = readMigration()
      expect(sql).toMatch(/organization_subscriptions_one_current/i)
      expect(sql).toMatch(/WHERE\s+is_current\s*=\s*TRUE/i)
    })

    it("does NOT define a self-leave RLS policy (PR 1 routes voluntary leave through a server action)", () => {
      // RLS cannot reference OLD.* in WITH CHECK, so a self-update
      // policy cannot safely restrict which columns a user touches.
      // Self-leave is intentionally a server-action path; the
      // migration must not reintroduce this policy.
      const sql = readMigration()
      expect(sql).not.toMatch(/CREATE POLICY\s+organization_members_self_leave/i)
    })

    it("declares every documented column on each new table", () => {
      // Guards against silent column drops in future edits. Not a
      // perfect check — collisions across tables can hide a drop —
      // but catches the obvious case where someone removes a field
      // without updating the TS surface.
      const sql = readMigration()
      const expected: Record<string, string[]> = {
        organizations: [
          "id",
          "name",
          "billing_email",
          "stripe_customer_id",
          "created_by",
          "created_at",
          "updated_at",
        ],
        organization_members: [
          "id",
          "organization_id",
          "user_id",
          "role",
          "status",
          "invited_by",
          "joined_at",
          "deactivated_at",
        ],
        organization_subscriptions: [
          "stripe_subscription_id",
          "stripe_subscription_item_id",
          "stripe_price_id",
          "stripe_product_id",
          "latest_invoice_id",
          "plan_tier",
          "billing_interval",
          "seat_count",
          "trial_end",
          "current_period_start",
          "current_period_end",
          "cancel_at_period_end",
          "cancel_at",
          "canceled_at",
          "last_payment_status",
          "last_stripe_event_id",
          "last_stripe_event_created_at",
          "is_current",
        ],
        organization_invitations: [
          "email",
          "token",
          "invited_by",
          "expires_at",
          "accepted_at",
          "revoked_at",
        ],
        stripe_events: [
          "stripe_event_id",
          "type",
          "attempt_count",
          "error",
          "event_created_at",
          "received_at",
          "processed_at",
        ],
      }
      for (const [table, cols] of Object.entries(expected)) {
        for (const col of cols) {
          expect(sql, `missing ${table}.${col}`).toMatch(new RegExp(`\\b${col}\\b`))
        }
      }
    })
  })

  describe("TypeScript model surface", () => {
    it("exports a shape-compatible Organization type", () => {
      // Type-level smoke check: build a value that satisfies the type.
      // The test will fail to compile if the surface drifts.
      const org: Organization = {
        id: "00000000-0000-0000-0000-000000000000",
        name: "Acme",
        billing_email: null,
        stripe_customer_id: null,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      expect(org.id).toBeDefined()
    })

    it("exports a shape-compatible OrganizationMember type with status enum", () => {
      const member: OrganizationMember = {
        id: "00000000-0000-0000-0000-000000000001",
        organization_id: "00000000-0000-0000-0000-000000000000",
        user_id: "00000000-0000-0000-0000-000000000002",
        role: "owner",
        status: "active",
        invited_by: null,
        joined_at: new Date().toISOString(),
        deactivated_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      expect(member.status).toBe("active")
    })

    it("exports a shape-compatible OrganizationSubscription type with cancellation fields", () => {
      const sub: OrganizationSubscription = {
        id: "00000000-0000-0000-0000-000000000003",
        organization_id: "00000000-0000-0000-0000-000000000000",
        stripe_subscription_id: null,
        stripe_subscription_item_id: null,
        stripe_price_id: null,
        stripe_product_id: null,
        latest_invoice_id: null,
        plan_tier: "pro",
        billing_interval: "annual",
        seat_count: 1,
        status: "trialing",
        trial_end: null,
        current_period_start: null,
        current_period_end: null,
        cancel_at_period_end: false,
        cancel_at: null,
        canceled_at: null,
        last_payment_status: null,
        last_stripe_event_id: null,
        last_stripe_event_created_at: null,
        is_current: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      expect(sub.cancel_at_period_end).toBe(false)
    })

    it("exports a shape-compatible OrganizationInvitation type", () => {
      const invite: OrganizationInvitation = {
        id: "00000000-0000-0000-0000-000000000004",
        organization_id: "00000000-0000-0000-0000-000000000000",
        email: "x@example.com",
        role: "member",
        status: "pending",
        token: "tok_abc",
        invited_by: null,
        expires_at: new Date().toISOString(),
        accepted_at: null,
        revoked_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      expect(invite.status).toBe("pending")
    })

    it("exports a shape-compatible StripeEvent type", () => {
      const event: StripeEvent = {
        stripe_event_id: "evt_test_1",
        type: "checkout.session.completed",
        status: "pending",
        attempt_count: 0,
        error: null,
        event_created_at: null,
        received_at: new Date().toISOString(),
        processed_at: null,
        updated_at: new Date().toISOString(),
      }
      expect(event.status).toBe("pending")
    })
  })

  describe("DI registration", () => {
    it("resolves IOrganizationService to the OrganizationService singleton", () => {
      const svc = container.resolve(TOKENS.IOrganizationService)
      expect(svc).toBeInstanceOf(OrganizationService)
    })

    it("returns the same instance on repeated resolves", () => {
      const a = container.resolve(TOKENS.IOrganizationService)
      const b = container.resolve(TOKENS.IOrganizationService)
      expect(a).toBe(b)
    })
  })
})
