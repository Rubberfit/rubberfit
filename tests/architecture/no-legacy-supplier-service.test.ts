/**
 * Architectural guard — `legacySupplierService` cutover.
 *
 * The DDD supplier slice (entity + service + repository + mapper) is
 * fully shipped at `src/infrastructure/services/supplierService.ts`.
 * The legacy raw-row shim at `legacySupplierService.ts` references
 * stale schema columns (`user_id`, `contact_person`, `phone`,
 * `zip_code`, `default_shipping_cost`) that no longer exist post the
 * 2026-04-21 redesign — writes against it would fail at runtime.
 *
 * Production app/ + src/ code must import the new `supplierService`.
 * The shim's supplier-table methods are kept only for:
 *
 *   1. `src/infrastructure/services/legacySupplierService.ts` itself.
 *   2. `src/infrastructure/api-client/rf/inventory.ts` — flag-gated
 *      Rust-backend fallback. Stays until Rust inventory rollout.
 *   3. Tests that mock the legacy module directly. Migrating those
 *      mocks is low-priority since the symbol still exists.
 *
 * This guard prevents future PRs from re-introducing
 * `legacySupplierService` imports in production code.
 */
import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

const REPO_ROOT = path.resolve(__dirname, "../..")

const ALLOWLIST = new Set<string>([
  "src/infrastructure/services/legacySupplierService.ts",
  "src/infrastructure/api-client/rf/inventory.ts",
])

const SCAN_EXTENSIONS = new Set([".ts", ".tsx"])
const LEGACY_IMPORT_RE = /from\s+["']@\/src\/infrastructure\/services\/legacySupplierService["']/

function* walk(dir: string): Generator<string> {
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

describe("architecture: no legacySupplierService imports in production code", () => {
  it("app/ and src/ (outside the allowlist) use the DDD supplierService", () => {
    const offenders: Array<{ file: string; line: number; text: string }> = []

    for (const root of ["app", "src"]) {
      for (const file of walk(path.join(REPO_ROOT, root))) {
        const rel = relPosix(file)
        if (ALLOWLIST.has(rel)) continue
        const source = fs.readFileSync(file, "utf-8")
        const lines = source.split(/\r?\n/)
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i] ?? ""
          if (LEGACY_IMPORT_RE.test(line)) {
            offenders.push({ file: rel, line: i + 1, text: line.trim() })
          }
        }
      }
    }

    if (offenders.length > 0) {
      const formatted = offenders.map((o) => `  ${o.file}:${o.line}\n    ${o.text}`).join("\n")
      throw new Error(
        `legacySupplierService imported from production code:\n${formatted}\n\n` +
          `Migrate to \`supplierService\` from @/src/infrastructure/services/supplierService, ` +
          `or add the file to ALLOWLIST in this test with a one-line reason if it's a ` +
          `flag-gated fallback or other documented exception.`
      )
    }
    expect(offenders).toEqual([])
  })

  it("allowlist entries actually exist on disk", () => {
    const missing = Array.from(ALLOWLIST).filter((p) => !fs.existsSync(path.join(REPO_ROOT, p)))
    expect(missing, `Allowlist references nonexistent files: ${missing.join(", ")}`).toEqual([])
  })
})
