/**
 * PR 3 architecture guard — Stripe webhook handler.
 *
 * Verifies the contract between the route handler, the webhook service,
 * the DI container, and the stripe_events idempotency table. The
 * substantive event-mapping logic is unit-tested separately in
 * `tests/stripe/stripe-webhook-service.test.ts` against a fake
 * IOrganizationService; this file is the static structural check.
 */
import { describe, it, expect } from "vitest"
import "reflect-metadata"
import fs from "node:fs"
import path from "node:path"
import { container } from "tsyringe"
import "@/di/resolve"
import { TOKENS } from "@/di/tokens"
import { StripeWebhookService } from "@/src/infrastructure/services/stripeWebhookService"

const REPO_ROOT = path.resolve(__dirname, "../..")
const ROUTE_PATH = path.join(REPO_ROOT, "app/api/stripe/webhook/route.ts")
const SERVICE_PATH = path.join(REPO_ROOT, "src/infrastructure/services/stripeWebhookService.ts")
const REGISTER_SCRIPT_PATH = path.join(REPO_ROOT, "scripts/stripe-webhook-register.mjs")

function readFile(p: string): string {
  return fs.readFileSync(p, "utf8")
}

describe("PR 3 — Stripe webhook handler", () => {
  describe("route file", () => {
    it("exists at app/api/stripe/webhook/route.ts", () => {
      expect(fs.existsSync(ROUTE_PATH)).toBe(true)
    })

    it("forces the Node runtime (Edge cannot give raw body bytes for signature verification)", () => {
      const src = readFile(ROUTE_PATH)
      expect(src).toMatch(/export\s+const\s+runtime\s*=\s*["']nodejs["']/)
    })

    it("forces dynamic rendering so the body is read fresh on every invocation", () => {
      const src = readFile(ROUTE_PATH)
      expect(src).toMatch(/export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/)
    })

    it("reads the stripe-signature header before invoking constructEvent", () => {
      const src = readFile(ROUTE_PATH)
      expect(src).toContain('stripe-signature')
      expect(src).toContain('constructEvent')
    })

    it("records the stripe_events idempotency row BEFORE running side effects", () => {
      const src = readFile(ROUTE_PATH)
      // recordEventReceived must run before handleEvent + markEventOutcome.
      const recordIdx = src.indexOf("recordEventReceived")
      const handleIdx = src.indexOf("handleEvent(event)")
      expect(recordIdx).toBeGreaterThan(0)
      expect(handleIdx).toBeGreaterThan(recordIdx)
    })

    it("returns 2xx without re-processing when the event is a duplicate", () => {
      const src = readFile(ROUTE_PATH)
      expect(src).toContain('record.kind === "duplicate"')
      expect(src).toContain("dedupe")
    })

    it("delegates Supabase access to IStripeWebhookService (no direct .from() calls)", () => {
      const src = readFile(ROUTE_PATH)
      // Route handler must not import the admin client directly.
      expect(src).not.toContain("makeAdminClient")
      // It must go through the service.
      expect(src).toContain("IStripeWebhookService")
      // Service is the one that owns the stripe_events table.
      const serviceSrc = readFile(SERVICE_PATH)
      expect(serviceSrc).toContain("makeAdminClient")
      expect(serviceSrc).toContain('from("stripe_events")')
      expect(serviceSrc).toMatch(/23505|duplicate key|stripe_events_pkey/)
    })

    it("declares a GET handler so Stripe's endpoint-test ping succeeds", () => {
      const src = readFile(ROUTE_PATH)
      expect(src).toMatch(/export\s+async\s+function\s+GET\b/)
    })
  })

  describe("DI registration", () => {
    it("resolves IStripeWebhookService to the StripeWebhookService singleton", () => {
      const svc = container.resolve(TOKENS.IStripeWebhookService)
      expect(svc).toBeInstanceOf(StripeWebhookService)
    })

    it("returns the same instance on repeated resolves", () => {
      const a = container.resolve(TOKENS.IStripeWebhookService)
      const b = container.resolve(TOKENS.IStripeWebhookService)
      expect(a).toBe(b)
    })
  })

  describe("service event coverage", () => {
    it("registers each event type the founder-locked plan requires", () => {
      // The service module declares HANDLED_EVENT_TYPES at the top.
      // Read the source rather than re-export the set to avoid
      // requiring the service to expose internals.
      const src = readFile(SERVICE_PATH)
      for (const eventType of [
        "checkout.session.completed",
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "customer.subscription.trial_will_end",
        "invoice.paid",
        "invoice.payment_failed",
      ]) {
        expect(src, `event ${eventType} not handled`).toContain(`"${eventType}"`)
      }
    })
  })

  describe("webhook-register script", () => {
    it("exists alongside stripe-setup.mjs", () => {
      expect(fs.existsSync(REGISTER_SCRIPT_PATH)).toBe(true)
    })

    it("subscribes to the exact same event set as the handler dispatches on", () => {
      const src = readFile(REGISTER_SCRIPT_PATH)
      for (const eventType of [
        "checkout.session.completed",
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "customer.subscription.trial_will_end",
        "invoice.paid",
        "invoice.payment_failed",
      ]) {
        expect(src, `register script missing ${eventType}`).toContain(`"${eventType}"`)
      }
    })

    it("gates live mode behind --confirm-live", () => {
      const src = readFile(REGISTER_SCRIPT_PATH)
      expect(src).toContain("--confirm-live")
      expect(src).toMatch(/Live mode requires --confirm-live/)
    })
  })
})
