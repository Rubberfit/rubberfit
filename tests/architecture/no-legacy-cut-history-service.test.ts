/**
 * Architectural guard — `legacyCutHistoryService` cutover.
 *
 * The DDD cut-history slice (entity + service + repository + mapper)
 * is fully shipped at `src/infrastructure/services/cutHistoryService.ts`.
 * The legacy raw-row shim at `legacyCutHistoryService.ts` retains the
 * pre-redesign surface: authorization-gated reads/deletes
 * (`getCutByIdAuthorized`, `deleteCutByIdAuthorized`,
 * `listCutHistoryPaginated`, `getCutAnalytics`) and the
 * `insertCutHistory(client, CutHistoryInsert)` write path that
 * `RecordCutUseCase` consumes.
 *
 * Production app/ + src/ code should import the new
 * `cutHistoryService`. The shim's methods are kept only for the
 * documented consumers below; each retires when its consumer is
 * rewritten through a use-case (authorization belongs in the
 * application layer, not the service).
 *
 * This guard prevents future PRs from re-introducing
 * `legacyCutHistoryService` imports in production code outside the
 * documented exceptions.
 */
import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

const REPO_ROOT = path.resolve(__dirname, "../..")

const ALLOWLIST = new Set<string>([
  "src/infrastructure/services/legacyCutHistoryService.ts",
  // Paginated cut-history list API. Consumes listCutHistoryPaginated.
  "app/api/cuts/history/route.ts",
  // Cut-history detail GET + DELETE. Consumes getCutByIdAuthorized +
  // deleteCutByIdAuthorized + CutNotFoundError + CutForbiddenError.
  "app/api/cuts/history/[id]/route.ts",
  // On-demand cut PDF regeneration. Consumes getCutByIdAuthorized +
  // CutNotFoundError + CutForbiddenError.
  "app/api/cuts/history/[id]/pdf/route.ts",
  // Cut-history analytics. Consumes getCutAnalytics.
  "app/api/analytics/cut-history/route.ts",
  // Production hot path — RecordCutUseCase imports insertCutHistory
  // + CutHistoryInsert. Migrating this use-case to consume
  // ICutHistoryService via DI is a separate, larger slice (the
  // use-case currently threads a SupabaseClient argument that
  // doesn't fit the getDatabaseClient() model without redesigning
  // the call site).
  "src/application/use-cases/cuts/record-cut.use-case.ts",
])

const SCAN_EXTENSIONS = new Set([".ts", ".tsx"])
const LEGACY_IMPORT_RE = /from\s+["']@\/src\/infrastructure\/services\/legacyCutHistoryService["']/

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

describe("architecture: no legacyCutHistoryService imports in production code", () => {
  it("app/ and src/ (outside the allowlist) use the DDD cutHistoryService", () => {
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
        `legacyCutHistoryService imported from production code:\n${formatted}\n\n` +
          `Migrate to \`cutHistoryService\` from @/src/infrastructure/services/cutHistoryService, ` +
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
