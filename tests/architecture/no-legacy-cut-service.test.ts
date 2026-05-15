/**
 * Architectural guard — `legacyCutService` cutover.
 *
 * The DDD cut slice (entity + service + repository + mapper) is fully
 * shipped at `src/infrastructure/services/cutService.ts`. The legacy
 * raw-row shim at `legacyCutService.ts` references pre-redesign
 * imperial column names (`waste_sqft`, `total_sqft_used`,
 * `cost_per_sqft`, `material_type`) that no longer exist on the
 * mm/sqmm-native `cuts` schema — its analytics methods will fail at
 * runtime against the live DB.
 *
 * Production app/ + src/ code should import the new `cutService`. The
 * shim's methods are kept only for:
 *
 *   1. `src/infrastructure/services/legacyCutService.ts` itself.
 *   2. The dashboard / analytics / notifications UI surfaces that
 *      still consume the imperial-shape return types. Each retires
 *      when that UI is rewritten against entity-typed reads.
 *
 * This guard prevents future PRs from re-introducing
 * `legacyCutService` imports in production code outside the
 * documented exceptions.
 */
import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

const REPO_ROOT = path.resolve(__dirname, "../..")

const ALLOWLIST = new Set<string>([
  "src/infrastructure/services/legacyCutService.ts",
  // Dashboard summary cards + activity sidebar. Consumes
  // getMonthlyWastePercentages, getRecentCutsWithRolls,
  // getCutsGrowthPercentage, getWasteImprovementPercentage.
  "app/dashboard/page.tsx",
  // Waste-comparison analytics. Consumes getCutsByDateRange.
  "app/dashboard/analytics/waste-comparison/page.tsx",
  // Report generator. Consumes getCutsByDateRangeWithRolls + the
  // CutWithRoll type re-export.
  "app/dashboard/analytics/reports/_components/report-generator.ts",
  // Notifications "recent activity" feed. Consumes
  // getRecentCutsWithRolls.
  "app/dashboard/notifications/_components/use-recent-activities.ts",
])

const SCAN_EXTENSIONS = new Set([".ts", ".tsx"])
const LEGACY_IMPORT_RE = /from\s+["']@\/src\/infrastructure\/services\/legacyCutService["']/

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

describe("architecture: no legacyCutService imports in production code", () => {
  it("app/ and src/ (outside the allowlist) use the DDD cutService", () => {
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
        `legacyCutService imported from production code:\n${formatted}\n\n` +
          `Migrate to \`cutService\` from @/src/infrastructure/services/cutService, ` +
          `or add the file to ALLOWLIST in this test with a one-line reason if it's a ` +
          `documented exception.`
      )
    }
    expect(offenders).toEqual([])
  })

  it("allowlist entries actually exist on disk", () => {
    const missing = Array.from(ALLOWLIST).filter((p) => !fs.existsSync(path.join(REPO_ROOT, p)))
    expect(missing, `Allowlist references nonexistent files: ${missing.join(", ")}`).toEqual([])
  })
})
