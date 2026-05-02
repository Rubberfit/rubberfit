/**
 * Security headers applied to every proxy-handled response.
 *
 * CSP is deployed in `Content-Security-Policy-Report-Only` mode initially
 * (ASVS V3 / Phase B). Violations are observable in browser devtools and
 * via the `report-to` directive once a report endpoint is wired, but
 * nothing is blocked. After a soak window with no false positives, this
 * promotes to enforcing `Content-Security-Policy` with per-request nonces.
 *
 * The CSP intentionally permits `'unsafe-inline'` and `'unsafe-eval'` for
 * scripts/styles in this report-only phase to avoid noisy violations from
 * Next.js runtime, React Compiler output, and Tailwind. The follow-up
 * ticket tightens these once nonces are wired through the layout.
 */
import { type NextResponse } from "next/server"

const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.googleusercontent.com https://avatars.githubusercontent.com https://*.supabase.co",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ")

const STATIC_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["Content-Security-Policy-Report-Only", CSP_REPORT_ONLY],
  // Two years, includeSubDomains, preload — meets the HSTS preload list
  // requirements. Once on the preload list, browsers refuse plain-HTTP
  // connections to the apex and any subdomain.
  ["Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload"],
  // X-Frame-Options is legacy; frame-ancestors in the CSP supersedes it.
  // We send both because some older browsers and corporate proxies still
  // honor only X-Frame-Options.
  ["X-Frame-Options", "DENY"],
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  // Disable browser features the app does not use. Each disabled feature
  // is one less attack surface for a compromised iframe or extension.
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=(), browsing-topics=()"],
]

/**
 * Mutates the response to attach the security header set, then returns
 * the same response for chaining.
 */
export function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const [name, value] of STATIC_HEADERS) {
    response.headers.set(name, value)
  }
  return response
}

/** Header names this module sets — exposed for tests and audits. */
export function getSecurityHeaderNames(): readonly string[] {
  return STATIC_HEADERS.map(([name]) => name)
}
