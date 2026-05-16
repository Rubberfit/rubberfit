import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./app/i18n/request.ts")
const projectRoot = dirname(fileURLToPath(import.meta.url))

// Expose the package.json version as `NEXT_PUBLIC_APP_VERSION` so the auth
// footer REV. chip (and any future build-stamped surface) can read it from
// the browser bundle without an extra runtime fetch.
const packageJson = JSON.parse(
  readFileSync(resolve(projectRoot, "./package.json"), "utf8")
)

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  devIndicators: false,
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },
  outputFileTracingRoot: projectRoot,
  compiler: {
    // Strip console noise from production builds, but preserve
    // `console.error` and `console.warn` so server-side incident
    // diagnostics survive into Vercel function logs.
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
  turbopack: {
    root: projectRoot,
  },
  // Webpack-only client-bundle stubs.
  //
  // Background: switching production builds to `next build --webpack`
  // (necessary to dodge Next 16's Turbopack proxy NFT trace
  // regression that left @swc/helpers/esm/* out of the lambda)
  // surfaced a real client/server boundary leak that Turbopack was
  // silently tolerating. `use-pack-job.ts` is a `"use client"` hook
  // that imports `@/di/resolve` to look up `IPackingService`; the
  // resolve helper transitively pulls in `di-registration.ts`,
  // which registers every server-side use-case in the app —
  // including `create-invitation.use-case.ts` which imports
  // `node:crypto`.
  //
  // Webpack 5 doesn't auto-stub `node:*` scheme imports on the
  // browser target (Turbopack does, which is why the leak went
  // unnoticed). The proper fix is to refactor use-pack-job to NOT
  // import the full DI tree client-side, but that's an
  // architectural change outside this hotfix's scope. Stubbing the
  // Node built-ins to `false` on the client bundle makes the
  // import resolve to an empty module — which is safe because the
  // code path that would call node:crypto only runs server-side
  // (use-cases resolve via TSyringe to server-only impls inside
  // server actions and route handlers; the client `IPackingService`
  // impl uses fetch instead).
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve = config.resolve ?? {}
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
        crypto: false,
        fs: false,
        path: false,
        child_process: false,
        os: false,
        net: false,
        tls: false,
        stream: false,
      }
      // Also strip the explicit `node:` scheme variants — webpack 5
      // treats `node:crypto` and `crypto` as different module ids,
      // so the fallback above doesn't cover the scheme form alone.
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        "node:crypto": false,
        "node:fs": false,
        "node:path": false,
        "node:child_process": false,
        "node:os": false,
        "node:net": false,
        "node:tls": false,
        "node:stream": false,
      }
    }
    return config
  },
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
