# Stripe Launch Handoff — test → live swap

When the Stripe rollout is ready to flip from test mode to live mode (real charges), this is the entire checklist. Designed so the founder can do the swap end-to-end without re-reading any other doc.

## What you flip

Three Stripe-side environment variables and one webhook endpoint registration. Nothing else changes — the catalog, the schema, the gating, the webhook handler are all environment-agnostic.

## Step-by-step

### 1. In Stripe Dashboard

1. Activate live mode (toggle in dashboard header — must complete account activation first: tax info, bank account, business details).
2. Settings → Developers → API keys → reveal your **live mode** Secret key (`sk_live_…`) and Publishable key (`pk_live_…`). Save somewhere safe.

### 2. In `rubberfit/.env.local` (or Vercel env vars for staging/prod)

Replace the existing values:

```bash
STRIPE_SECRET_KEY=sk_live_…               # was sk_test_…
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_… # was pk_test_…
# STRIPE_WEBHOOK_SECRET will be replaced in step 4 after re-registering the webhook
```

### 3. Run the catalog setup script in live mode

```bash
npm run stripe:setup -- --confirm-live
```

The script auto-detects `sk_live_` and refuses to run without `--confirm-live` as a safety gate. It creates 4 Products (`rubberfit_standard`, `rubberfit_pro`, `rubberfit_max`, `rubberfit_enterprise`) and 6 Prices with stable lookup keys (`rubberfit.<tier>.<monthly|annual>.v1`). Re-running is idempotent.

**Verify in Stripe Dashboard → Products** that all 4 products and 6 prices show with correct USD amounts ($199 / $1,908 / $349 / $3,348 / $699 / $6,708).

### 4. Register the live webhook endpoint

When PR 3 lands, run the webhook-registration helper (also auto-detects live mode and gates behind `--confirm-live`). It calls `stripe.webhookEndpoints.create` against your production URL (`https://rubberfit.app/api/stripe/webhook`) and returns a fresh signing secret.

Paste that secret into `.env.local` / Vercel env:

```bash
STRIPE_WEBHOOK_SECRET=whsec_…   # the live one, distinct from the test one
```

The test-mode `whsec_…` stays in your local dev `.env.local`; live is for deployed environments only.

### 5. Smoke-test before announcing

- Open `rubberfit.app/register` → `/checkout` → pick a plan → enter a real card → verify the charge appears in Live Mode → cancel the subscription.
- Verify the webhook delivery in Stripe Dashboard → Webhooks → your endpoint → Events tab shows `checkout.session.completed` etc. as `Succeeded`.
- Verify the org row in Supabase shows `status=trialing` and the cancellation flow flips `status=canceled` at period end.

## What does NOT change between test and live

- Migration SQL (already applied in Supabase)
- Catalog lookup_keys (the app resolves prices by lookup_key, which is identical in both modes)
- RLS policies + helpers
- Webhook handler logic
- Onboarding / checkout / portal UI

That's the design contract: code is mode-agnostic; only the keys change.

## If something goes wrong

- **Catalog drift**: `npm run stripe:setup -- --confirm-live` is idempotent. Re-run safely.
- **Webhook signature mismatch**: the `STRIPE_WEBHOOK_SECRET` env doesn't match the endpoint. Re-fetch from Stripe Dashboard → Webhooks → endpoint detail → "Signing secret."
- **Currency wrong**: catalog is hard-coded USD. If you need EUR/GBP/etc., bump the lookup_key version (`.v1` → `.v2`) and re-run — Stripe lets multi-currency prices coexist.
- **Customer panic**: switch the kill-switch env `STRIPE_GATE_ENFORCED=false` (added in PR 5) to disable the paywall app-wide until the issue is resolved.

## Reference IDs (test mode — for development continuity)

```
prod_id            tier        active
rubberfit_standard standard    ✓
rubberfit_pro      pro         ✓
rubberfit_max      max         ✓
rubberfit_enterprise enterprise ✓

lookup_key                          unit_amount  interval
rubberfit.standard.monthly.v1       $199.00      month
rubberfit.standard.annual.v1        $1,908.00    year
rubberfit.pro.monthly.v1            $349.00      month
rubberfit.pro.annual.v1             $3,348.00    year
rubberfit.max.monthly.v1            $699.00      month
rubberfit.max.annual.v1             $6,708.00    year
```

Live-mode IDs will be the same (the product IDs use stable string keys, so `rubberfit_standard` in live mode is the same string). Stripe-assigned `price_…` IDs differ between test and live.
