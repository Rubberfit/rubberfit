import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./app/i18n/request.ts")

// Expose the package.json version as `NEXT_PUBLIC_APP_VERSION` so the auth
// footer REV. chip (and any future build-stamped surface) can read it from
// the browser bundle without an extra runtime fetch.
const packageJson = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "./package.json"), "utf8")
)

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  devIndicators: false,
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },
  // Force `@swc/helpers/esm/**` into every lambda's file trace.
  //
  // Background: an npm `overrides` entry pins @swc/helpers to 0.5.21
  // (commit a5483042f) to satisfy next-intl's @swc/core peer-dep
  // requirement. Starting at 0.5.17 the package's `exports` map uses
  // a non-standard `module-sync` condition to point ESM consumers at
  // its `esm/` subdirectory. Vercel's `@vercel/nft` tracer does not
  // follow that condition, so the `esm/*.js` helper files never get
  // copied into the lambda bundle — every preview deployment then
  // 500s with
  //   Cannot find module '/var/task/node_modules/@swc/helpers/esm/_interop_require_default.js'
  // on any request that hits a default-import of a CJS module
  // through middleware or a Node-runtime route handler.
  //
  // The forced trace include below is the complementary lambda-bundle
  // fix for the same package — without it, the override gets honoured
  // at install time but the helpers stop short of the deployment.
  // Verified locally that the path glob resolves real files. Remove
  // this block when @swc/helpers ships a tracer-friendly exports
  // map, or when next-intl's @swc/core peer requirement relaxes.
  outputFileTracingIncludes: {
    "**/*": ["./node_modules/@swc/helpers/esm/**/*.js"],
  },
  compiler: {
    // Strip console noise from production builds, but preserve
    // `console.error` and `console.warn` so server-side incident
    // diagnostics survive into Vercel function logs.
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
  // Empty turbopack config to silence the warning
  turbopack: {},
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "*.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },
  async redirects() {
    return [
      // Host-based redirect from legacy app.* and dashboard.* subdomains
      // to the apex rubberfit.app. 308 (permanent) so bookmarks and
      // email links migrate cleanly. Path + query string are preserved.
      // www.rubberfit.app is also folded to apex for the same reason.
      {
        source: "/:path*",
        has: [{ type: "host", value: "app.rubberfit.app" }],
        destination: "https://rubberfit.app/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "dashboard.rubberfit.app" }],
        destination: "https://rubberfit.app/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.rubberfit.app" }],
        destination: "https://rubberfit.app/:path*",
        permanent: true,
      },
      // S4 Task 3 — IA consolidation. `permanent: true` emits HTTP 308
      // so bookmarks keep working across customers. These redirects
      // are the contract for pre-S4 URLs; do not remove without a
      // migration plan.
      {
        source: "/dashboard/default",
        destination: "/dashboard",
        permanent: true,
      },
      {
        source: "/dashboard/default/:path*",
        destination: "/dashboard/:path*",
        permanent: true,
      },
      {
        source: "/dashboard/procurement/purchase-orders",
        destination: "/dashboard/inventory/purchase-orders",
        permanent: true,
      },
      {
        source: "/dashboard/procurement/:path*",
        destination: "/dashboard/inventory/:path*",
        permanent: true,
      },
      // Materials moved under Inventory.
      {
        source: "/dashboard/materials",
        destination: "/dashboard/inventory/materials",
        permanent: true,
      },
      {
        source: "/dashboard/materials/:path*",
        destination: "/dashboard/inventory/materials/:path*",
        permanent: true,
      },
      // S4 Task 8 — Cut Planner rebranded to Cutting Engine;
      // batch + manual sub-modes removed. Old sub-paths collapse
      // to the single unified engine route; query params are
      // preserved so `?loadCut=…` deep links keep working.
      {
        source: "/dashboard/cut-planner",
        destination: "/dashboard/cutting-engine",
        permanent: true,
      },
      {
        source: "/dashboard/cut-planner/batch",
        destination: "/dashboard/cutting-engine",
        permanent: true,
      },
      {
        source: "/dashboard/cut-planner/manual",
        destination: "/dashboard/cutting-engine",
        permanent: true,
      },
      {
        source: "/dashboard/cut-planner/:path*",
        destination: "/dashboard/cutting-engine/:path*",
        permanent: true,
      },
      // Nesting Engine was briefly the working name mid-task;
      // keep the redirect so any intermediate links survive.
      {
        source: "/dashboard/nesting-engine",
        destination: "/dashboard/cutting-engine",
        permanent: true,
      },
      {
        source: "/dashboard/nesting-engine/:path*",
        destination: "/dashboard/cutting-engine/:path*",
        permanent: true,
      },
      // S4 Task 9 — Analytics consolidation. Six top-level routes
      // collapsed under /dashboard/analytics/* with a shared tabbed
      // layout. Query strings preserved so filter deep-links survive.
      {
        source: "/dashboard/waste",
        destination: "/dashboard/analytics/waste",
        permanent: true,
      },
      {
        source: "/dashboard/waste-comparison",
        destination: "/dashboard/analytics/waste-comparison",
        permanent: true,
      },
      {
        source: "/dashboard/usage",
        destination: "/dashboard/analytics/usage",
        permanent: true,
      },
      {
        source: "/dashboard/costs",
        destination: "/dashboard/analytics/costs",
        permanent: true,
      },
      {
        source: "/dashboard/trends",
        destination: "/dashboard/analytics/trends",
        permanent: true,
      },
      {
        source: "/dashboard/reports",
        destination: "/dashboard/analytics/reports",
        permanent: true,
      },
      // S4 Task 10 — Settings + account consolidation.
      // `/dashboard/account` folds into Settings → Profile tab.
      {
        source: "/dashboard/account",
        destination: "/dashboard/settings/profile",
        permanent: true,
      },
    ]
  },
}

export default withNextIntl(nextConfig)
