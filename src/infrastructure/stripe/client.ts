import Stripe from "stripe"

const STRIPE_API_VERSION = "2026-04-22.dahlia"

let stripeClient: Stripe | null = null

export function getStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is not configured")

  stripeClient ??= new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
  })

  return stripeClient
}
