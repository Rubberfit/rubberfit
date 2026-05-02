/**
 * Tests the proxy.ts matcher against `unstable_doesProxyMatch` from
 * Next.js's experimental testing surface.
 *
 * The matcher is the single source of truth for which requests reach
 * proxy() at all. A bug here silently disables auth on whatever
 * pathname accidentally falls outside the matcher.
 */
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server"
import { describe, expect, it } from "vitest"

import { config } from "@/proxy"

// `unstable_doesMiddlewareMatch` is still the export name in next 16.2.x —
// the docs page for `proxy.ts` advertises `unstable_doesProxyMatch` but
// the rename hasn't propagated to the testing utilities yet.
const matches = (url: string) => unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })

describe("proxy matcher: covers app routes by default-deny", () => {
  it.each([
    "/",
    "/dashboard",
    "/dashboard/inventory",
    "/dashboard/cutting-engine",
    "/admin/users",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/mfa-challenge",
    "/callback",
    "/auth-email-logo",
    "/api/tax-rates",
    "/api/cuts/history",
    "/api/admin/users",
    "/api/v2/pack",
  ])("matches application path %s", (url) => {
    expect(matches(url)).toBe(true)
  })
})

describe("proxy matcher: excludes static assets", () => {
  it.each([
    "/_next/static/chunks/main.js",
    "/_next/static/css/app.css",
    "/_next/image",
    "/favicon.ico",
    "/logo.svg",
    "/banner.png",
    "/photo.jpg",
    "/icon.webp",
  ])("does not match static asset %s", (url) => {
    expect(matches(url)).toBe(false)
  })
})
