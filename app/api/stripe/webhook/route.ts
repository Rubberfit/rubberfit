// Stripe webhook endpoint — Rubberfit Stripe rollout PR 3.
//
// Responsibilities:
//   1. Verify the request signature using the raw body. This MUST run
//      on the Node runtime — Edge runtime does not give us bytes-faithful
//      access to the request body that Stripe signs against.
//   2. De-duplicate via IStripeWebhookService.recordEventReceived,
//      which inserts the event id into `stripe_events` with
//      status='pending' (or returns `duplicate` if it was seen).
//   3. Hand the verified Stripe.Event to IStripeWebhookService.handleEvent,
//      which dispatches by event type and mutates org/subscription rows.
//   4. Mark the outcome via IStripeWebhookService.markEventOutcome.
//      Errors → 5xx so Stripe retries with exponential backoff.
//      Handled / skipped → 2xx so Stripe stops resending.
//
// All Supabase access lives inside the service (per Clean Architecture).
// This file only does HTTP shaping + signature verification.

import { NextResponse, type NextRequest } from "next/server"
import Stripe from "stripe"
import "reflect-metadata"
import { container } from "tsyringe"

import "@/di/resolve" // triggers DI registration
import { TOKENS } from "@/di/tokens"
import type { IStripeWebhookService } from "@/src/application/services/stripe-webhook.service.interface"

// Force Node runtime: signature verification needs the raw body bytes
// that Stripe signed. Edge runtime's Request body APIs do not give us
// what we need without re-encoding.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const STRIPE_API_VERSION = "2026-04-22.dahlia" as const

function badRequest(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

function ok(body: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ ok: true, ...body })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secretKey = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secretKey || !webhookSecret) {
    // Missing config is a 5xx so Stripe retries (operator may be
    // mid-deploy with env not yet rotated).
    return badRequest("Stripe webhook env is not configured", 500)
  }

  const signature = request.headers.get("stripe-signature")
  if (!signature) {
    return badRequest("Missing stripe-signature header")
  }

  // Raw bytes are required for verifyHeader. Stripe's signed payload
  // replaces the "validate JSON body with Zod" pattern the rest of
  // app/api/ uses; see ALLOWLIST entry in
  // tests/architecture/api-routes-validate-bodies.test.ts.
  const rawBody = await request.text()

  const stripe = new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
  })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return badRequest(`Signature verification failed: ${message}`)
  }

  const service = container.resolve<IStripeWebhookService>(TOKENS.IStripeWebhookService)
  const eventCreatedAt = new Date(event.created * 1000).toISOString()

  const record = await service.recordEventReceived({
    eventId: event.id,
    eventType: event.type,
    eventCreatedAt,
  })

  if (record.kind === "duplicate") {
    return ok({ dedupe: true, event_id: event.id })
  }
  if (record.kind === "error") {
    // Log the full error server-side; the response body — visible in
    // Stripe Dashboard webhook logs — only references the event id so
    // we don't leak DB/connection-string details to anyone with access
    // to those logs.
    console.error(`[stripe-webhook] record event=${event.id} failed:`, record.error)
    return badRequest(`Failed to record stripe_event (event_id=${event.id})`, 500)
  }
  // `record.kind === "retry"` falls through to re-run handleEvent.
  // The bumped attempt_count was persisted by recordEventReceived.

  const startedAt = Date.now()
  let outcome: Awaited<ReturnType<IStripeWebhookService["handleEvent"]>>

  try {
    outcome = await service.handleEvent(event)
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    await service.markEventOutcome(event.id, {
      kind: "error",
      eventType: event.type,
      error,
    })
    console.error(`[stripe-webhook] handler threw event=${event.id} type=${event.type}:`, error)
    return badRequest(`Unhandled exception in webhook service (event_id=${event.id})`, 500)
  }

  await service.markEventOutcome(event.id, outcome)

  if (outcome.kind === "error") {
    console.error(
      `[stripe-webhook] handler failed event=${event.id} type=${event.type}:`,
      outcome.error
    )
    return badRequest(`Webhook handler failed (event_id=${event.id})`, 500)
  }

  return ok({
    event_id: event.id,
    type: event.type,
    outcome: outcome.kind,
    note: outcome.kind === "handled" ? outcome.note : outcome.reason,
    duration_ms: Date.now() - startedAt,
  })
}

/**
 * Stripe pings with GET when testing the endpoint URL during
 * registration. Respond positively so the registration succeeds.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true, endpoint: "stripe-webhook" })
}
