import type Stripe from "stripe"

export interface StripePriceListResult {
  data: Array<Pick<Stripe.Price, "id">>
}
export type StripeCustomerResult = Pick<Stripe.Customer, "id">
export type StripeCheckoutSessionResult = Pick<Stripe.Checkout.Session, "url">

export interface StripeBillingClient {
  prices: {
    list(params: Stripe.PriceListParams): Promise<StripePriceListResult>
  }
  customers: {
    create(
      params: Stripe.CustomerCreateParams,
      options?: Stripe.RequestOptions
    ): Promise<StripeCustomerResult>
  }
  checkout: {
    sessions: {
      create(params: Stripe.Checkout.SessionCreateParams): Promise<StripeCheckoutSessionResult>
    }
  }
}

export interface IStripeClientService {
  getClient(): StripeBillingClient
}
