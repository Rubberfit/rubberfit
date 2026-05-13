/**
 * Architectural guard for ARC-141 (ASVS V2.2.1).
 *
 * Every API route file under `app/api/**` that exports a write-method
 * handler (POST / PATCH / PUT / DELETE) AND parses a request body
 * (via `request.json()` or `request.formData()`) MUST either:
 *
 *   1. Forward the request to the Rust backend via `forwardToRust(...)`
 *      (the bridge layer at `app/api/v2/_lib/bridge.ts`). Rust validates
 *      its own payloads — Phase A explicitly carves these out.
 *
 *   2. Validate the body against a Zod schema via `.safeParse(...)` or
 *      `<schema>.parse(...)`. The codebase convention is `safeParse`
 *      with a 400 response on failure (see app/actions/<domain>.ts and
 *      the routes hardened in ARC-141 / bundle 3).
 *
 * Routes that don't read a body (cron triggers, no-body POSTs that
 * operate on path params, DELETE handlers) skip the check — there's
 * nothing to validate. The body-parse detection makes the rule
 * self-correcting: adding `await request.json()` to one of those
 * routes immediately enrolls it in the gate.
 *
 * Allowlist: empty by default. If a future route legitimately can't
 * fit either pattern (e.g. a multipart upload that can't be modeled
 * in Zod), add it here with a one-line reason.
 */
import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

const REPO_ROOT = path.resolve(__dirname, "../..")
const API_DIR = path.join(REPO_ROOT, "app", "api")

const ALLOWLIST = new Set<string>([
  // Stripe webhook signs its raw-bytes body via stripe-signature
  // header; stripe.webhooks.constructEvent is the equivalent guard.
  // Re-validating with Zod after Stripe's signature pass would be
  // redundant and would corrupt the raw-bytes path Stripe needs.
  "app/api/stripe/webhook/route.ts",
])

const WRITE_METHOD_RE = /export\s+(?:async\s+)?(?:function|const)\s+(POST|PATCH|PUT|DELETE)\b/g
const ZOD_PARSE_RE = /\b(?:safeParse|[a-zA-Z][a-zA-Z0-9_]*Schema\.parse)\(/
const BRIDGE_FORWARD_RE = /\bforwardToRust\(/
// Detects body-reading patterns. `request.json()` / `req.json()` cover
// JSON callers; `request.formData()` covers multipart uploads. The
// double-pattern is intentional — request handlers in this repo bind
// the param as `request` or `req` interchangeably.
const BODY_PARSE_RE = /\b(?:request|req)\.(?:json|formData|text|arrayBuffer|blob)\(/

// Detects schema-mode markers. `.strict()` rejects unknown keys;
// `.passthrough()` keeps them. Default Zod mode silently drops them,
// which is the BOPLA hazard ARC-137 closes.
const STRICT_RE = /\.strict\s*\(/
const PASSTHROUGH_RE = /\.passthrough\s*\(/

/**
 * Strip line and block comments from a TS source. The schema-mode
 * detection has to ignore comment text — otherwise a doc comment that
 * says ``// `.passthrough()` keeps optional knobs`` would falsely
 * trigger the rule.
 *
 * Block comments are replaced with a string of newlines matching the
 * comment's newline count so line indices in the stripped text stay
 * aligned with the original source. Without that, a multi-line JSDoc
 * collapses to a single character and every later line drifts —
 * breaking the rationale-comment scan that walks both texts in lockstep.
 */
function stripComments(source: string): string {
  const noBlock = source.replace(/\/\*[\s\S]*?\*\//g, (match) => {
    const newlines = (match.match(/\n/g) ?? []).length
    return "\n".repeat(newlines)
  })
  return noBlock
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("//")
      return idx >= 0 ? line.slice(0, idx) : line
    })
    .join("\n")
}
// Detects schema-ish imports the route pulls in (1-hop only). The
// codebase convention for body validators is `*Schema` / `*schema`,
// so we follow only those imports rather than every import the route
// happens to use.
const SCHEMA_IMPORT_RE =
  /import\s+(?:type\s+)?\{\s*([^}]*?(?:[Ss]chema)[^}]*?)\s*\}\s+from\s+["']([^"']+)["']/g

interface RouteFile {
  rel: string
  abs: string
  source: string
  noBlock: string
  methods: string[]
}

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walk(full)
    } else if (entry.isFile() && entry.name === "route.ts") {
      yield full
    }
  }
}

function relPosix(absPath: string): string {
  return path.relative(REPO_ROOT, absPath).replace(/\\/g, "/")
}

function loadRouteFiles(): RouteFile[] {
  const files: RouteFile[] = []
  for (const abs of walk(API_DIR)) {
    const source = fs.readFileSync(abs, "utf-8")
    // Strip block comments so a doc comment mentioning POST() doesn't
    // trigger the write-method matcher.
    const noBlock = source.replace(/\/\*[\s\S]*?\*\//g, "")
    const methods: string[] = []
    WRITE_METHOD_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = WRITE_METHOD_RE.exec(noBlock)) !== null) {
      if (!methods.includes(m[1])) methods.push(m[1])
    }
    files.push({ rel: relPosix(abs), abs, source, noBlock, methods })
  }
  return files
}

/**
 * Resolve a TS import specifier to an absolute file path on disk.
 * Handles the `@/` alias (root-relative) and relative `./` imports.
 * Returns null for bare/external imports (`zod`, `next/server`, …).
 */
function resolveImport(spec: string, fromAbs: string): string | null {
  let base: string | null = null
  if (spec.startsWith("@/")) {
    base = path.join(REPO_ROOT, spec.slice(2))
  } else if (spec.startsWith(".")) {
    base = path.resolve(path.dirname(fromAbs), spec)
  }
  if (!base) return null
  // Try direct file match, then index forms.
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c
  }
  return null
}

/**
 * Gather the route file's source plus the source of any 1-hop
 * `*Schema` / `*schema` imports. The schema-mode check operates on
 * this combined set so a schema defined in a sibling file (e.g.
 * `packRequestSchema` in `src/application/packing/types.ts`) is
 * still inspected for its `.strict()` / `.passthrough()` decision.
 *
 * Returns an array so callers can pin the offending file when a
 * `.passthrough()` rationale comment is missing.
 */
function gatherSchemaSources(file: RouteFile): { rel: string; source: string }[] {
  const out: { rel: string; source: string }[] = [{ rel: file.rel, source: file.source }]
  SCHEMA_IMPORT_RE.lastIndex = 0
  let m: RegExpExecArray | null
  const seen = new Set<string>([file.rel])
  while ((m = SCHEMA_IMPORT_RE.exec(file.source)) !== null) {
    const spec = m[2]
    const resolved = resolveImport(spec, file.abs)
    if (!resolved) continue
    const rel = relPosix(resolved)
    if (seen.has(rel)) continue
    seen.add(rel)
    try {
      out.push({ rel, source: fs.readFileSync(resolved, "utf-8") })
    } catch {
      // Unreadable — leave it out; the schema-mode check will surface
      // the route as a violation, which is the right signal.
    }
  }
  return out
}

describe("architecture: API write routes validate bodies (ARC-141)", () => {
  it("every POST/PATCH/PUT/DELETE handler under app/api/ uses Zod or forwards to Rust", () => {
    const files = loadRouteFiles()
    const writeFiles = files.filter((f) => f.methods.length > 0)

    const violations: { rel: string; methods: string[]; reason: string }[] = []
    for (const file of writeFiles) {
      if (ALLOWLIST.has(file.rel)) continue
      // Skip routes that don't read a body — cron triggers, path-param
      // operations, no-body POST/DELETE. The gate exists to keep
      // *parsed* bodies from being trusted unchecked.
      if (!BODY_PARSE_RE.test(file.noBlock)) continue
      const validates = ZOD_PARSE_RE.test(file.noBlock)
      const bridges = BRIDGE_FORWARD_RE.test(file.noBlock)
      if (!validates && !bridges) {
        violations.push({
          rel: file.rel,
          methods: file.methods,
          reason: "parses a body but no `.safeParse(` / `<schema>.parse(` / `forwardToRust(`",
        })
      }
    }

    if (violations.length > 0) {
      const summary = violations
        .map((v) => `  ${v.rel} (${v.methods.join(", ")}) — ${v.reason}`)
        .join("\n")
      throw new Error(
        `API write routes missing body validation:\n${summary}\n\n` +
          `Add a Zod schema and call \`schema.safeParse(rawBody)\` before using the body, ` +
          `or — for v2 bridge routes — call \`forwardToRust(...)\`. ` +
          `If the route legitimately can't fit either pattern (e.g. multipart upload), ` +
          `add it to ALLOWLIST in this test with a one-line reason.`
      )
    }
    expect(violations).toEqual([])
  })

  // ARC-137 / V8.2.3 — mass-assignment guard. Default Zod silently
  // drops unknown keys, which is exactly the BOPLA path we want to
  // close. Every Zod schema used to validate a request body must
  // pick a side: `.strict()` (reject unknown → 400) or
  // `.passthrough()` (accept unknown → forwarded to a downstream
  // strict consumer, with a comment documenting why). No silent
  // default-mode schemas on the route surface.
  it("every Zod schema used as a request-body validator uses .strict() or documented .passthrough()", () => {
    const files = loadRouteFiles()
    const writeFiles = files.filter(
      (f) =>
        f.methods.length > 0 &&
        BODY_PARSE_RE.test(f.noBlock) &&
        ZOD_PARSE_RE.test(f.noBlock) &&
        // Bridge routes that *also* use Zod (none today) would be
        // covered too. Pure forwardToRust routes have no schema and
        // are correctly excluded by the ZOD_PARSE_RE filter.
        !ALLOWLIST.has(f.rel)
    )

    const violations: { rel: string; reason: string }[] = []
    for (const file of writeFiles) {
      const sources = gatherSchemaSources(file)
      // Strip comments before deciding whether a real `.strict()` /
      // `.passthrough()` call exists — comment text mentioning either
      // (e.g. doc-comment examples) must not flip the decision.
      const sourcesNoComments = sources.map((s) => ({
        rel: s.rel,
        source: s.source,
        code: stripComments(s.source),
      }))
      const codeCombined = sourcesNoComments.map((s) => s.code).join("\n")
      const hasStrict = STRICT_RE.test(codeCombined)
      const hasPassthrough = PASSTHROUGH_RE.test(codeCombined)

      if (!hasStrict && !hasPassthrough) {
        violations.push({
          rel: file.rel,
          reason:
            "uses Zod for body validation but no `.strict()` / `.passthrough()` in the route or a 1-hop `*Schema` import — default Zod mode silently drops unknown keys (BOPLA / V8.2.3 hazard)",
        })
        continue
      }
      if (hasPassthrough) {
        // Find the file that holds the *real* call. Then on its
        // original (with-comments) source, scan for the call's line
        // and require a comment containing "passthrough" within 8
        // lines preceding it. The check is intentionally lenient —
        // any rationale wording works; the point is that a future
        // reader sees *why* the carve-out is there.
        const owner = sourcesNoComments.find((s) => PASSTHROUGH_RE.test(s.code))
        if (!owner) continue // shouldn't happen if hasPassthrough is true
        const codeLines = owner.code.split("\n")
        const origLines = owner.source.split("\n")
        let documented = false
        for (let i = 0; i < codeLines.length; i++) {
          if (!/\.passthrough\s*\(/.test(codeLines[i])) continue
          // Walk the 8 preceding lines (and the call line itself) of
          // the *original* source so comment text is visible. The
          // call line's own occurrence of "passthrough" gets stripped
          // so it can't satisfy its own requirement.
          const slice = origLines.slice(Math.max(0, i - 8), i + 1).join("\n")
          if (/passthrough/i.test(slice.replace(/\.passthrough\s*\(/g, ""))) {
            documented = true
            break
          }
        }
        if (!documented) {
          violations.push({
            rel: file.rel,
            reason: `\`.passthrough()\` in ${owner.rel} lacks a rationale comment within 8 lines (must mention "passthrough" so reviewers see the BOPLA carve-out is intentional)`,
          })
        }
      }
    }

    if (violations.length > 0) {
      const summary = violations.map((v) => `  ${v.rel} — ${v.reason}`).join("\n")
      throw new Error(
        `Zod schemas missing .strict() / documented .passthrough():\n${summary}\n\n` +
          `Add .strict() to reject unknown keys, or document a .passthrough() decision ` +
          `with an adjacent comment containing the word "passthrough".`
      )
    }
    expect(violations).toEqual([])
  })

  it("allowlist entries actually exist on disk", () => {
    const missing = Array.from(ALLOWLIST).filter((p) => !fs.existsSync(path.join(REPO_ROOT, p)))
    expect(missing, `Allowlist references nonexistent files: ${missing.join(", ")}`).toEqual([])
  })
})
