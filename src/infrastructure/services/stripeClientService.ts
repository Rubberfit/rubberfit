import "reflect-metadata"
import { injectable } from "tsyringe"

import type {
  IStripeClientService,
  StripeBillingClient,
} from "@/src/application/services/stripe-client.service.interface"
import { getStripeClient } from "@/src/infrastructure/stripe/client"

@injectable()
export class StripeClientService implements IStripeClientService {
  getClient(): StripeBillingClient {
    const stripe = getStripeClient()

    return {
      prices: {
        list: (params) => stripe.prices.list(params),
      },
      customers: {
        create: (params, options) => stripe.customers.create(params, options),
      },
      checkout: {
        sessions: {
          create: (params) => stripe.checkout.sessions.create(params),
        },
      },
      subscriptions: {
        update: (id, params) => stripe.subscriptions.update(id, params),
      },
    }
  }
}

export const stripeClientService = new StripeClientService()
