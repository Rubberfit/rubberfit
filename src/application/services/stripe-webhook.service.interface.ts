import type Stripe from "stripe"

/**
 * Outcome of processing a Stripe webhook event. The route handler uses
 * this to decide what status to write to the `stripe_events` row and
 * what HTTP code to return to Stripe.
 *
 * - `handled`: event was understood and mutations succeeded (write
 *   processed, return 2xx so Stripe stops retrying).
 * - `skipped`: event type is not one we react to — record processed,
 *   return 2xx (so Stripe stops resending).
 * - `error`: mutation failed — record status=error with the message,
 *   return 5xx so Stripe retries with exponential backoff.
 */
export type StripeWebhookOutcome =
  | { kind: "handled"; eventType: string; note?: string }
  | { kind: "skipped"; eventType: string; reason: string }
  | { kind: "error"; eventType: string; error: Error }

/**
 * Result of recording a Stripe event for idempotency tracking.
 *
 * - `accepted`: a new stripe_events row was inserted; proceed with
 *   processing.
 * - `retry`: a row already exists but is in `pending` or `error`
 *   state — a prior attempt didn't reach `processed`. The route
 *   should re-run `handleEvent` so transient failures recover. The
 *   service has already bumped `attempt_count` on the existing row.
 * - `duplicate`: a row already exists with status `processed`. The
 *   event was successfully handled before; the route should return
 *   2xx without re-processing.
 */
export type StripeEventRecord =
  | { kind: "accepted" }
  | { kind: "retry"; previousStatus: "pending" | "error"; attemptCount: number }
  | { kind: "duplicate" }
  | { kind: "error"; error: Error }

/**
 * IStripeWebhookService — dispatches a verified Stripe event to the
 * right billing-state update, and owns the stripe_events idempotency
 * + status-tracking surface. Signature verification + HTTP shaping
 * happen in the route handler; everything else lives here.
 */
export interface IStripeWebhookService {
  /**
   * Insert a stripe_events row with status='pending'. Returns
   * `duplicate` when the event id was previously seen (the route
   * should short-circuit to 2xx).
   */
  recordEventReceived(input: {
    eventId: string
    eventType: string
    eventCreatedAt: string
  }): Promise<StripeEventRecord>

  /**
   * Dispatch a verified event to the right side-effect path.
   */
  handleEvent(event: Stripe.Event): Promise<StripeWebhookOutcome>

  /**
   * Record the terminal state of a processed event on the
   * stripe_events row.
   */
  markEventOutcome(eventId: string, outcome: StripeWebhookOutcome): Promise<void>
}
