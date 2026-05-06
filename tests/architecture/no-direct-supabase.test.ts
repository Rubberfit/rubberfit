/**
 * Architectural guard for issue #155.
 *
 * CLAUDE.md says infrastructure services in `src/infrastructure/` are the
 * ONLY code allowed to talk to Supabase. App-layer files (`app/**`,
 * `proxy.ts`) must delegate through a service or use-case instead of
 * calling `supabase.from(...)`, `.rpc(...)`, `.storage.*`, or
 * constructing their own `createClient` / `createServerClient`.
 *
 * This test fails if any non-allowlisted file in `app/` (or `proxy.ts`)
 * does any of the below:
 *
 *   1. Imports the `supabase` browser-singleton client from
 *      `@/src/infrastructure/models/supabase`.
 *   2. Builds its own client via `createClient` / `createServerClient`
 *      from `@supabase/ssr` or `@supabase/supabase-js`.
 *   3. Calls `.from("table_name")`, `.rpc("name")`, or `.storage.*` on
 *      any client variable (catches local aliases like `db`,
 *      `adminClient`, `authClient`).
 *
 * The allowlist contains files that legitimately need to touch Supabase
 * from the app layer — primarily auth flows where Next.js cookie binding
 * is unavoidable. Each entry has a comment explaining why it can't move.
 *
 * As migration work lands, entries are removed from the allowlist. Once
 * the list is down to the documented auth exceptions, the boundary is
 * locked in: any future PR that reintroduces a direct Supabase call in
 * `app/` will fail this test.
 */
import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

const REPO_ROOT = path.resolve(__dirname, "../..")

/**
 * Files allowed to touch Supabase directly.
 *
 * Categories:
 *   • #155 follow-up: still violating, will migrate before this PR lands
 *   • auth exception: cookie/session-bound code that can't move
 */
const ALLOWLIST = new Set<string>([
  // ── auth exceptions — permanently allowlisted ─────────────────────
  // Middleware session hydration. The `createServerClient` call is
  // unavoidable here (cookies live on NextRequest/NextResponse). The
  // `profiles.super_admin` lookup migrates to `authService` in this PR
  // — but the cookie-bound client itself stays.
  "proxy.ts",
  // OAuth code exchange + MFA AAL check. The `profiles` upsert
  // migrates to `authService.upsertProfileFromAuth`; auth machinery
  // stays.
  "app/(auth)/callback/route.ts",
  // `onAuthStateChange` subscription. Browser-side auth event
  // listener — can't move.
  "app/(auth)/_components/reset-password-form.tsx",
  // `signInWithOAuth` redirect. Browser-side auth.
  "app/contexts/auth-actions.ts",
  // Module-scoped client used ONLY for JWT verification (documented
  // in the file). No `.from()` calls.
  "app/api/internal/tax/po-preview/route.ts",
  // Cookie→bearer bridge for the Rust backend. Constructs a client
  // for Supabase auth verification only.
  "app/api/v2/_lib/bridge.ts",
  // Server-client factory thin wrapper. Internally re-exports
  // `@/src/infrastructure/supabase/server-clients` — kept to avoid
  // breaking imports in this PR's diff.
  "app/api/_lib/supabase-server.ts",
  // Server-action auth boundary (ARC-147). Constructs a cookie-bound
  // `createServerClient` via `next/headers`. The cookie binding is
  // unavoidable here. Phase 4 moved the profile read into the shared
  // `getProfileAccess` helper (in src/infrastructure/services/authService),
  // so the only remaining hit is the `createServerClient` import.
  "app/server/auth/require-authenticated-user.ts",
  // Server-action database factory (ARC-147 follow-up). Builds a
  // request-scoped, cookie-bound `createServerClient` and registers
  // it via `registerServerDatabaseClientFactory`. The Next.js
  // `cookies()` binding is the same framework boundary as the auth
  // helper above, so this file must live in `app/`. No `.from(...)`
  // or `.rpc(...)` calls are made here directly — only client
  // construction.
  "app/server/database/register-factory.ts",

  // ── #155 in-flight: removed as migrations land ────────────────────
])

interface Violation {
  file: string
  line: number
  text: string
  reason: string
}

interface Pattern {
  re: RegExp
  reason: string
}

const PATTERNS: Pattern[] = [
  // .from("table_name") — Supabase table query, ignoring `Array.from`
  // (no quoted-string arg) and similar.
  { re: /\.from\(\s*["'][a-z_][a-z0-9_]*["']\s*[,)]/, reason: ".from('table')" },
  // .rpc("name") — Supabase remote procedure call.
  { re: /\.rpc\(\s*["'][a-z_]/, reason: ".rpc('fn')" },
  // .storage.<method>( — Supabase storage API.
  { re: /\.storage\.[a-zA-Z_]/, reason: ".storage." },
]

// Raw-client import detection. Anchors at start-of-line so the lazy
// `[^{}]*?` for the import clause can't span multiple statements.
const RAW_CLIENT_IMPORT_RE =
  /(?:^|\n)([ \t]*import\s+(?:type\s+)?(?:\{[^{}]*?\}|\w+))\s+from\s+["']@supabase\/(?:ssr|supabase-js)["']/g

// The browser-singleton import is checked separately because we only
// flag it when the `supabase` value (not just types) is imported.
// Anchors at start-of-line so the lazy `[\s\S]*?` between `import` and
// `from "..."` can't span multiple statements (greedy backtracking
// across statement boundaries was the source of false positives).
const BROWSER_SINGLETON_IMPORT_RE =
  /(?:^|\n)([ \t]*import\s+(?:type\s+)?\{[^{}]*?\})\s+from\s+["']@\/src\/infrastructure\/models\/supabase["']/g

const SCAN_EXTENSIONS = new Set([".ts", ".tsx"])

function isAllowlisted(file: string): boolean {
  return ALLOWLIST.has(file.replace(/\\/g, "/"))
}

function* walk(dir: string, skip: ReadonlySet<string> = new Set()): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue
    const full = path.join(dir, entry.name)
    if (skip.has(full)) continue
    if (entry.isDirectory()) {
      yield* walk(full, skip)
    } else if (entry.isFile() && SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      yield full
    }
  }
}

function relPosix(absPath: string): string {
  return path.relative(REPO_ROOT, absPath).replace(/\\/g, "/")
}

/**
 * Scan a file's lines, filtering out comments. We strip `//`-line and
 * `/* * /` block comments so a documentation comment that mentions
 * `supabase.from(...)` doesn't trigger the guard. (The CLAUDE.md
 * example in this file's own header is why this matters.)
 */
function scanFile(absPath: string): Violation[] {
  const rel = relPosix(absPath)
  const source = fs.readFileSync(absPath, "utf-8")

  // Strip block comments first (multi-line capable).
  const noBlock = source.replace(/\/\*[\s\S]*?\*\//g, "")

  const violations: Violation[] = []
  const lines = noBlock.split(/\r?\n/)

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? ""
    // Drop trailing line comments before pattern-matching.
    const code = raw.replace(/\/\/.*$/, "")
    if (!code.trim()) continue

    for (const { re, reason } of PATTERNS) {
      if (re.test(code)) {
        violations.push({ file: rel, line: i + 1, text: raw, reason })
      }
    }
  }

  // Browser-singleton import: only flag if `supabase` is imported as a
  // *value* (not just types).
  BROWSER_SINGLETON_IMPORT_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = BROWSER_SINGLETON_IMPORT_RE.exec(noBlock)) !== null) {
    const clause = (match[1] ?? "").trim()
    if (/^import\s+type\b/.test(clause)) continue
    const innerMatch = clause.match(/\{([^{}]*)\}/)
    const inner = innerMatch?.[1] ?? ""
    const names = inner
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    const importsSupabaseValue = names.some(
      (n) => /^supabase\b/.test(n) || /^supabase\s+as\b/.test(n)
    )
    if (!importsSupabaseValue) continue
    const matchOffset = match.index + (match[0].startsWith("\n") ? 1 : 0)
    const lineIdx = noBlock.slice(0, matchOffset).split(/\r?\n/).length
    violations.push({
      file: rel,
      line: lineIdx,
      text: lines[lineIdx - 1] ?? clause,
      reason: "browser singleton import",
    })
  }

  // Raw-client imports: flag only when at least one *value* binding
  // is imported. `import type { SupabaseClient } from "@supabase/..."`
  // is fine — it's just a type. `import { createClient }` is a
  // violation because it constructs a client at runtime.
  RAW_CLIENT_IMPORT_RE.lastIndex = 0
  while ((match = RAW_CLIENT_IMPORT_RE.exec(noBlock)) !== null) {
    const clause = (match[1] ?? "").trim()
    if (/^import\s+type\b/.test(clause)) continue
    const matchOffset = match.index + (match[0].startsWith("\n") ? 1 : 0)
    const lineIdx = noBlock.slice(0, matchOffset).split(/\r?\n/).length
    const innerMatch = clause.match(/\{([^{}]*)\}/)
    if (!innerMatch) {
      // Default- or namespace-import — every name is a value.
      violations.push({
        file: rel,
        line: lineIdx,
        text: lines[lineIdx - 1] ?? clause,
        reason: "raw createClient import",
      })
      continue
    }
    const names = innerMatch[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    const hasValueImport = names.some((n) => !/^type\s/.test(n))
    if (!hasValueImport) continue
    violations.push({
      file: rel,
      line: lineIdx,
      text: lines[lineIdx - 1] ?? clause,
      reason: "raw createClient import",
    })
  }

  return violations
}

function format(violations: Violation[]): string {
  return violations
    .map((v) => `  ${v.file}:${v.line} (${v.reason})\n    ${v.text.trim()}`)
    .join("\n")
}

describe("architecture: no direct Supabase calls outside src/infrastructure/", () => {
  it("app/ and proxy.ts only touch Supabase through services or the allowlist", () => {
    const violations: Violation[] = []

    // proxy.ts at the repo root.
    const proxyPath = path.join(REPO_ROOT, "proxy.ts")
    if (fs.existsSync(proxyPath)) {
      violations.push(...scanFile(proxyPath))
    }

    // Everything under app/.
    for (const file of walk(path.join(REPO_ROOT, "app"))) {
      violations.push(...scanFile(file))
    }

    // Everything under src/ except src/infrastructure/ — services and
    // repositories there ARE allowed to call Supabase. Anything else
    // under src/ (entities, application/, interface-adapters/, etc.)
    // must stay framework- and Supabase-agnostic.
    const srcSkip = new Set([path.join(REPO_ROOT, "src", "infrastructure")])
    for (const file of walk(path.join(REPO_ROOT, "src"), srcSkip)) {
      violations.push(...scanFile(file))
    }

    const offenders = violations.filter((v) => !isAllowlisted(v.file))
    if (offenders.length > 0) {
      throw new Error(
        `Direct Supabase usage detected outside src/infrastructure/:\n${format(offenders)}\n\n` +
          `Add the file to ALLOWLIST in this test if it's a legitimate auth exception, or migrate the call into a service.`
      )
    }
    expect(offenders).toEqual([])
  })

  it("allowlist entries actually exist on disk", () => {
    // Catches stale entries — a file renamed or migrated whose
    // allowlist entry was forgotten. Keeps the allowlist honest.
    const missing: string[] = []
    for (const entry of ALLOWLIST) {
      if (!fs.existsSync(path.join(REPO_ROOT, entry))) {
        missing.push(entry)
      }
    }
    expect(missing, `Allowlist references nonexistent files: ${missing.join(", ")}`).toEqual([])
  })

  it("infrastructure services route Supabase via getDatabaseClient(), not the singleton", () => {
    // Phase 4 ratchet (post-ARC-147 cleanup).
    //
    // The singleton at `@/src/infrastructure/models/supabase` is built
    // with `createBrowserClient` — fine in the browser, useless on the
    // server where there's no localStorage and no JWT in `auth.uid()`.
    // Phase 0 introduced `getDatabaseClient()` as the runtime-aware
    // resolver. Infrastructure services that mutate or auth-bind data
    // must use it.
    //
    // This guard catches the regression where a future PR reverts a
    // service to `import { supabase }`. Browser-only files
    // (auth flows, storage / bucket helpers, the resolver itself)
    // legitimately stay on the singleton — they're allowlisted with
    // a one-line reason. Each future migration removes one entry.
    //
    // Type-only imports (`import { type Roll }`) are fine — only the
    // VALUE binding (the live client) is the hazard.
    const INFRA_ALLOWLIST = new Set<string>([
      // ── permanent: the resolver itself ────────────────────────────
      // get-database-client wraps the singleton — that's the whole
      // point. Without this exemption the rule would block its
      // implementation.
      "src/infrastructure/supabase/get-database-client.ts",

      // ── auth flows — singleton is correct here ────────────────────
      // Browser-side sign-in/out, MFA enrollment, OAuth redirect,
      // password reset. Cookie-bound server clients can't drive the
      // browser auth state machine, so these stay on the singleton.
      "src/infrastructure/services/authService.ts",
      "src/infrastructure/services/authMfaService.ts",
      // The deprecated browser-side userId helper. Tracked for
      // removal once `record-cut.use-case` and the cuts API route
      // migrate to per-route auth.
      "src/infrastructure/services/getCurrentUserId.ts",
      // Browser-side role hook. Reads the current session.
      "src/infrastructure/services/useRole.ts",

      // ── storage / bucket helpers ──────────────────────────────────
      // Storage uploads (avatars, roll barcodes, PDFs) currently use
      // the browser singleton because they're called from browser
      // contexts. Migrating storage to getDatabaseClient is a separate
      // pass — the cookie-bound server client supports storage too.
      "src/infrastructure/services/jobPdfShareService.ts",
      "src/infrastructure/services/rollBarcodeAssetService.ts",
      "src/infrastructure/services/visionExtractionService.ts",
      "src/infrastructure/repositories/profiles.repository.ts",

      // ── pre-ARC-147, not yet reachable from server actions ────────
      // These services have legitimate callers but none from server
      // actions today, so the RLS hazard hasn't surfaced. Each
      // migration that pulls them server-side should also flip them
      // to getDatabaseClient and remove the entry here.
      "src/infrastructure/services/csvService.ts",
      "src/infrastructure/services/cutHistoryService.ts",
      "src/infrastructure/services/cutService.ts",
      "src/infrastructure/services/emailService.ts",
      "src/infrastructure/services/priceHistoryService.ts",
      "src/infrastructure/services/purchaseOrderAnalytics.ts",
      "src/infrastructure/repositories/jobs.repository.ts",
      "src/infrastructure/repositories/material-suppliers.repository.ts",
      // Has both migrated (addRoll, existsByMaterialType) and
      // unmigrated methods. Removing this entry is blocked on
      // migrating the rest.
      "src/infrastructure/repositories/rolls.repository.ts",
    ])

    const infraDir = path.join(REPO_ROOT, "src", "infrastructure")
    const violations: Violation[] = []

    for (const file of walk(infraDir)) {
      const rel = relPosix(file)
      if (INFRA_ALLOWLIST.has(rel)) continue
      const source = fs.readFileSync(file, "utf-8")
      const noBlock = source.replace(/\/\*[\s\S]*?\*\//g, "")
      const lines = noBlock.split(/\r?\n/)

      BROWSER_SINGLETON_IMPORT_RE.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = BROWSER_SINGLETON_IMPORT_RE.exec(noBlock)) !== null) {
        const clause = (match[1] ?? "").trim()
        if (/^import\s+type\b/.test(clause)) continue
        const innerMatch = clause.match(/\{([^{}]*)\}/)
        const inner = innerMatch?.[1] ?? ""
        const names = inner
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
        const importsSupabaseValue = names.some(
          (n) => /^supabase\b/.test(n) || /^supabase\s+as\b/.test(n)
        )
        if (!importsSupabaseValue) continue
        const matchOffset = match.index + (match[0].startsWith("\n") ? 1 : 0)
        const lineIdx = noBlock.slice(0, matchOffset).split(/\r?\n/).length
        violations.push({
          file: rel,
          line: lineIdx,
          text: lines[lineIdx - 1] ?? clause,
          reason: "browser singleton import in src/infrastructure/",
        })
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `Browser-singleton import in src/infrastructure/ outside the resolver:\n${format(violations)}\n\n` +
          `Migrate to \`getDatabaseClient()\` from @/src/infrastructure/supabase/get-database-client, ` +
          `or add the file to INFRA_ALLOWLIST in this test with a one-line reason if it has ` +
          `a legitimate browser-only call path (auth, storage upload, etc.).`
      )
    }
    expect(violations).toEqual([])
  })

  it("infra allowlist entries actually exist on disk", () => {
    const INFRA_ALLOWLIST_PATHS = [
      "src/infrastructure/supabase/get-database-client.ts",
      "src/infrastructure/services/authService.ts",
      "src/infrastructure/services/authMfaService.ts",
      "src/infrastructure/services/getCurrentUserId.ts",
      "src/infrastructure/services/useRole.ts",
      "src/infrastructure/services/jobPdfShareService.ts",
      "src/infrastructure/services/rollBarcodeAssetService.ts",
      "src/infrastructure/services/visionExtractionService.ts",
      "src/infrastructure/repositories/profiles.repository.ts",
      "src/infrastructure/services/csvService.ts",
      "src/infrastructure/services/cutHistoryService.ts",
      "src/infrastructure/services/cutService.ts",
      "src/infrastructure/services/emailService.ts",
      "src/infrastructure/services/priceHistoryService.ts",
      "src/infrastructure/services/purchaseOrderAnalytics.ts",
      "src/infrastructure/repositories/jobs.repository.ts",
      "src/infrastructure/repositories/material-suppliers.repository.ts",
      "src/infrastructure/repositories/rolls.repository.ts",
    ]
    const missing = INFRA_ALLOWLIST_PATHS.filter((p) => !fs.existsSync(path.join(REPO_ROOT, p)))
    expect(missing, `Infra allowlist references nonexistent files: ${missing.join(", ")}`).toEqual(
      []
    )
  })
})
