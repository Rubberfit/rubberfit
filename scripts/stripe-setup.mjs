#!/usr/bin/env node
// Stripe catalog setup script — Rubberfit Stripe rollout PR 2.
//
// Creates / verifies the 4 Products + 6 Prices in the Stripe account
// pointed at by STRIPE_SECRET_KEY. Idempotent:
//   - Products are looked up by stable id (`rubberfit_<tier>`) via
//     stripe.products.retrieve. Strongly consistent — re-runs always
//     find an existing product. Stripe's Search API is eventually
//     consistent and unsafe for this purpose (back-to-back re-runs
//     produce duplicates).
//   - Prices are matched by lookup_key via stripe.prices.list (also
//     strongly consistent). Existing prices with the same lookup_key
//     + amount + interval are left alone. If amounts drift, the
//     script HALTS and asks you to bump the lookup_key version
//     (`.v1` → `.v2`). Prices are largely immutable in Stripe and
//     mutating a live price would corrupt active subscriptions.
//
// Usage:
//   node scripts/stripe-setup.mjs              # apply to whichever
//                                              # mode the secret key is in
//   node scripts/stripe-setup.mjs --dry-run    # show plan, no writes
//   node scripts/stripe-setup.mjs --confirm-live  # required for sk_live_…
//
// Reads .env.local automatically if present; otherwise expects
// STRIPE_SECRET_KEY in the environment.

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"
import Stripe from "stripe"

import { CATALOG_VERSION, PRODUCT_KEY, PRODUCTS } from "./stripe-catalog.mjs"

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

function loadEnvLocal() {
  try {
    const content = readFileSync(path.join(REPO_ROOT, ".env.local"), "utf8")
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim()
      if (!line || line.startsWith("#")) continue
      const eq = line.indexOf("=")
      if (eq === -1) continue
      const key = line.slice(0, eq).trim()
      let value = line.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = value
    }
  } catch {
    // No .env.local — rely on the environment.
  }
}

function detectMode(apiKey) {
  if (apiKey.startsWith("sk_test_")) return "test"
  if (apiKey.startsWith("sk_live_")) return "live"
  throw new Error(
    `STRIPE_SECRET_KEY has an unexpected prefix. Expected sk_test_… or sk_live_…`
  )
}

function fmtUsd(cents) {
  return `$${(cents / 100).toFixed(2)}`
}

function productIdFor(tier) {
  return `${PRODUCT_KEY}_${tier}`
}

async function findProductById(stripe, tier) {
  // Stable id lookup is strongly consistent — unlike products.search
  // which is eventually consistent and unsafe for back-to-back runs.
  try {
    return await stripe.products.retrieve(productIdFor(tier))
  } catch (err) {
    if (err?.statusCode === 404 || err?.code === "resource_missing") return null
    throw err
  }
}

async function findPriceByLookupKey(stripe, lookupKey) {
  const result = await stripe.prices.list({
    lookup_keys: [lookupKey],
    limit: 2,
  })
  if (result.data.length > 1) {
    throw new Error(
      `Multiple prices share lookup_key ${lookupKey}. Run \`stripe prices list --lookup-keys=${lookupKey}\` and reconcile.`
    )
  }
  return result.data[0] ?? null
}

async function ensureProduct(stripe, productSpec, opts) {
  const metadata = {
    app: PRODUCT_KEY,
    product: PRODUCT_KEY, // for cross-product Reports filters
    tier: productSpec.tier,
    catalog_version: CATALOG_VERSION,
  }
  const productPayload = {
    name: productSpec.name,
    description: productSpec.description,
    statement_descriptor: productSpec.statementDescriptor,
    metadata,
    tax_code: "txcd_10103000", // SaaS / business use — Stripe Tax product code
  }

  const stableId = productIdFor(productSpec.tier)
  const existing = await findProductById(stripe, productSpec.tier)
  if (existing) {
    if (opts.dryRun) {
      console.log(`  · [dry-run] would update Product ${existing.id} (${productSpec.tier})`)
      return existing
    }
    const updated = await stripe.products.update(existing.id, productPayload)
    console.log(`  · product ${updated.id} (${productSpec.tier}) [exists, updated metadata]`)
    return updated
  }

  if (opts.dryRun) {
    console.log(
      `  · [dry-run] would create Product ${stableId} (${productSpec.tier}): ${productSpec.name}`
    )
    return { id: stableId, ...productPayload }
  }
  const created = await stripe.products.create({ id: stableId, ...productPayload })
  console.log(`  · created Product ${created.id} (${productSpec.tier}): ${productSpec.name}`)
  return created
}

async function ensurePrice(stripe, productId, priceSpec, productTier, opts) {
  const metadata = {
    app: PRODUCT_KEY,
    product: PRODUCT_KEY,
    tier: productTier,
    interval: priceSpec.interval === "year" ? "annual" : "monthly",
    catalog_version: CATALOG_VERSION,
  }

  const existing = await findPriceByLookupKey(stripe, priceSpec.lookupKey)
  if (existing) {
    if (existing.unit_amount !== priceSpec.unitAmount) {
      throw new Error(
        `Price ${priceSpec.lookupKey} exists with unit_amount=${existing.unit_amount} but spec says ${priceSpec.unitAmount}. Stripe prices are immutable — bump the lookup_key version (e.g. ${priceSpec.lookupKey} → ${priceSpec.lookupKey.replace(/\.v\d+$/, ".v2")}) and migrate.`
      )
    }
    if (
      existing.recurring?.interval !== priceSpec.interval ||
      existing.recurring?.interval_count !== priceSpec.intervalCount
    ) {
      throw new Error(
        `Price ${priceSpec.lookupKey} exists with interval=${existing.recurring?.interval}/${existing.recurring?.interval_count} but spec says ${priceSpec.interval}/${priceSpec.intervalCount}. Bump the lookup_key version.`
      )
    }
    // Metadata + nickname are mutable.
    if (!opts.dryRun) {
      await stripe.prices.update(existing.id, {
        nickname: priceSpec.nickname,
        metadata,
      })
    }
    console.log(
      `  · price ${priceSpec.lookupKey} → ${existing.id} (${fmtUsd(priceSpec.unitAmount)}/${priceSpec.interval}) [exists]`
    )
    return existing
  }

  const pricePayload = {
    product: productId,
    unit_amount: priceSpec.unitAmount,
    currency: "usd",
    recurring: {
      interval: priceSpec.interval,
      interval_count: priceSpec.intervalCount,
    },
    lookup_key: priceSpec.lookupKey,
    nickname: priceSpec.nickname,
    transfer_lookup_key: false,
    metadata,
  }

  if (opts.dryRun) {
    console.log(
      `  · [dry-run] would create Price ${priceSpec.lookupKey} (${fmtUsd(priceSpec.unitAmount)}/${priceSpec.interval})`
    )
    return { id: "(dry-run)", ...pricePayload }
  }

  const created = await stripe.prices.create(pricePayload)
  console.log(
    `  · created Price ${priceSpec.lookupKey} → ${created.id} (${fmtUsd(priceSpec.unitAmount)}/${priceSpec.interval})`
  )
  return created
}

async function main() {
  loadEnvLocal()

  const apiKey = process.env.STRIPE_SECRET_KEY
  if (!apiKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it to .env.local or export it before running."
    )
  }
  const mode = detectMode(apiKey)
  const dryRun = process.argv.includes("--dry-run")
  const confirmLive = process.argv.includes("--confirm-live")

  if (mode === "live" && !confirmLive && !dryRun) {
    throw new Error(
      "Live mode detected (sk_live_…). Re-run with --confirm-live to actually mutate the live catalog."
    )
  }

  console.log(
    `Stripe catalog setup — mode: ${mode}${dryRun ? " (dry-run)" : ""}, catalog_version: ${CATALOG_VERSION}`
  )
  console.log("")

  const stripe = new Stripe(apiKey, {
    apiVersion: "2026-04-22.dahlia",
    typescript: false,
  })

  for (const productSpec of PRODUCTS) {
    console.log(`Product: ${productSpec.tier}`)
    const product = await ensureProduct(stripe, productSpec, { dryRun })
    for (const priceSpec of productSpec.prices) {
      await ensurePrice(stripe, product.id, priceSpec, productSpec.tier, { dryRun })
    }
    if (productSpec.prices.length === 0) {
      console.log("  · no Price (enterprise is mailto-only)")
    }
    console.log("")
  }

  console.log("Done.")
}

main().catch((err) => {
  console.error("")
  console.error("stripe-setup failed:", err.message)
  if (process.env.STRIPE_DEBUG) console.error(err)
  process.exitCode = 1
})
