/**
 * Architectural guard for ARC-138 (ASVS V13.3.1).
 *
 * Every `process.env.X` reference in production source MUST have a
 * matching entry in `.env.example`. The check is forward-only —
 * documented-but-unreferenced entries are allowed (they may be
 * placeholders for upcoming runtime reads, like the Rust feature
 * flags). The hazard ARC-138 closes is the reverse: a new server-side
 * env var landing in code without operators knowing they need to set
 * it, which used to force `.env` files to be passed around over Slack.
 *
 * Scope: `app/`, `src/`, `proxy.ts`, `next.config.mjs`. Tests, e2e
 * fixtures, and docs are excluded — those reference env vars but
 * don't determine the operator-supplied env surface.
 *
 * Allowlisted runtime-injected vars (don't need a .env.example entry):
 *   NODE_ENV     — Node runtime
 *   CI           — set by GH Actions / Vercel
 *   VERCEL       — set by Vercel during deploy
 *   NEXT_PUBLIC_VERCEL_URL — auto-injected by Vercel preview deploys
 *   NEXT_PUBLIC_APP_VERSION — derived from package.json by next.config.mjs's
 *     `env:` field, so it's build-time-injected (not operator-set). Adding
 *     it to .env.example would mislead operators into thinking the value
 *     is configurable when it always comes from the bundled package.json.
 */
import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

const REPO_ROOT = path.resolve(__dirname, "../..")
const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".js"])
const ENV_EXAMPLE_PATH = path.join(REPO_ROOT, ".env.example")

const RUNTIME_INJECTED = new Set([
  "NODE_ENV",
  "CI",
  "VERCEL",
  "NEXT_PUBLIC_VERCEL_URL",
  "NEXT_PUBLIC_APP_VERSION",
])

// Matches `process.env.FOO`, `process.env["FOO"]`, `process.env['FOO']`,
// and `process.env[`FOO`]` so bracket-notation accesses can't slip past
// the guard. The repo uses dot-access exclusively today (verified by
// grep), but a future contributor switching to bracket access for a
// dynamic-keyed env shouldn't silently bypass the documentation rule.
const ENV_REFERENCE_RE =
  /process\.env(?:\.([A-Z][A-Z0-9_]+)|\[\s*["'`]([A-Z][A-Z0-9_]+)["'`]\s*\])/g
const ENV_EXAMPLE_KEY_RE = /^([A-Z][A-Z0-9_]+)=/

interface Reference {
  name: string
  file: string
  line: number
}

function* walk(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walk(full)
    } else if (entry.isFile() && SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      yield full
    }
  }
}

function relPosix(absPath: string): string {
  return path.relative(REPO_ROOT, absPath).replace(/\\/g, "/")
}

function scanFile(absPath: string): Reference[] {
  const rel = relPosix(absPath)
  const source = fs.readFileSync(absPath, "utf-8")
  const lines = source.split(/\r?\n/)
  const refs: Reference[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ""
    ENV_REFERENCE_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = ENV_REFERENCE_RE.exec(line)) !== null) {
      // Capture group 1 is the dot-access name; group 2 is the
      // bracket-access name. Exactly one will be set per match.
      const name = match[1] ?? match[2]
      if (name) refs.push({ name, file: rel, line: i + 1 })
    }
  }

  return refs
}

function readEnvExampleKeys(): Set<string> {
  const text = fs.readFileSync(ENV_EXAMPLE_PATH, "utf-8")
  const keys = new Set<string>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const match = ENV_EXAMPLE_KEY_RE.exec(line)
    if (match) keys.add(match[1])
  }
  return keys
}

function collectReferences(): Reference[] {
  const refs: Reference[] = []
  const proxyPath = path.join(REPO_ROOT, "proxy.ts")
  if (fs.existsSync(proxyPath)) refs.push(...scanFile(proxyPath))
  const nextConfigPath = path.join(REPO_ROOT, "next.config.mjs")
  if (fs.existsSync(nextConfigPath)) refs.push(...scanFile(nextConfigPath))
  for (const file of walk(path.join(REPO_ROOT, "app"))) refs.push(...scanFile(file))
  for (const file of walk(path.join(REPO_ROOT, "src"))) refs.push(...scanFile(file))
  return refs
}

describe("architecture: .env.example documents every server-side env var (ARC-138)", () => {
  it(".env.example exists at the repo root", () => {
    expect(fs.existsSync(ENV_EXAMPLE_PATH)).toBe(true)
  })

  it("every process.env reference in production source has an entry in .env.example", () => {
    const documented = readEnvExampleKeys()
    const refs = collectReferences()
    const referenced = new Map<string, Reference>()
    for (const ref of refs) {
      if (RUNTIME_INJECTED.has(ref.name)) continue
      if (!referenced.has(ref.name)) referenced.set(ref.name, ref)
    }

    const missing: { name: string; first: Reference }[] = []
    for (const [name, first] of referenced) {
      if (!documented.has(name)) missing.push({ name, first })
    }

    if (missing.length > 0) {
      const summary = missing
        .map(({ name, first }) => `  ${name}\n    first reference: ${first.file}:${first.line}`)
        .join("\n")
      throw new Error(
        `process.env references missing from .env.example:\n${summary}\n\n` +
          `Add an entry to .env.example with a placeholder + comment explaining purpose and sensitivity. ` +
          `Runtime-injected vars (currently: ${[...RUNTIME_INJECTED].sort().join(", ")}) are exempt — ` +
          `extend RUNTIME_INJECTED in this test if a new platform-injected var lands.`
      )
    }
    expect(missing).toEqual([])
  })
})
