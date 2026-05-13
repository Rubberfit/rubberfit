// Stripe catalog source of truth — shared between the setup script
// and the architecture test. Keep prices here in sync with the
// marketing site's pricing page (`rubberfit-marketing/src/app/pricing/`).
//
// Amounts are in cents. lookup_key is the stable identifier the app
// uses to resolve a Price at runtime — `<product>.<tier>.<interval>.<vN>`.
// When prices change, bump the version (`v1` → `v2`) and create a new
// Price; never mutate amounts on an existing Price (Stripe doesn't
// allow it for active subscriptions anyway).

export const CATALOG_VERSION = "2026-05-12"
export const PRODUCT_KEY = "rubberfit"

// 4 Products. Enterprise is mailto-only — created in Stripe for the
// dashboard view + future migration but has no Price.
export const PRODUCTS = [
  {
    tier: "standard",
    name: "Rubberfit Standard",
    description: "Floor ops only — inventory, cuts, jobs, basic dashboards.",
    statementDescriptor: "RUBBERFIT STD",
    prices: [
      {
        lookupKey: "rubberfit.standard.monthly.v1",
        unitAmount: 19900, // $199.00
        interval: "month",
        intervalCount: 1,
        nickname: "Standard · Monthly",
      },
      {
        lookupKey: "rubberfit.standard.annual.v1",
        unitAmount: 190800, // $1,908.00 ($159/mo × 12)
        interval: "year",
        intervalCount: 1,
        nickname: "Standard · Annual ($159/mo)",
      },
    ],
  },
  {
    tier: "pro",
    name: "Rubberfit Pro",
    description: "Standard + analytics, cut history export, branded PDFs.",
    statementDescriptor: "RUBBERFIT PRO",
    prices: [
      {
        lookupKey: "rubberfit.pro.monthly.v1",
        unitAmount: 34900, // $349.00
        interval: "month",
        intervalCount: 1,
        nickname: "Pro · Monthly",
      },
      {
        lookupKey: "rubberfit.pro.annual.v1",
        unitAmount: 334800, // $3,348.00 ($279/mo × 12)
        interval: "year",
        intervalCount: 1,
        nickname: "Pro · Annual ($279/mo)",
      },
    ],
  },
  {
    tier: "max",
    name: "Rubberfit Max",
    description: "Pro + CRM, AI nesting, multi-shop.",
    statementDescriptor: "RUBBERFIT MAX",
    prices: [
      {
        lookupKey: "rubberfit.max.monthly.v1",
        unitAmount: 69900, // $699.00
        interval: "month",
        intervalCount: 1,
        nickname: "Max · Monthly",
      },
      {
        lookupKey: "rubberfit.max.annual.v1",
        unitAmount: 670800, // $6,708.00 ($559/mo × 12)
        interval: "year",
        intervalCount: 1,
        nickname: "Max · Annual ($559/mo)",
      },
    ],
  },
  {
    tier: "enterprise",
    name: "Rubberfit Enterprise",
    description: "Custom — sales-managed. Pricing varies; no Stripe Price attached.",
    statementDescriptor: "RUBBERFIT ENT",
    prices: [], // mailto-only; no Price
  },
]
