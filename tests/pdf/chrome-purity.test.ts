/**
 * Phase 7 PR 1 — locks the `app/lib/pdf` purity rule.
 *
 * The server-side cut-PDF route (`app/api/cuts/history/[id]/pdf/route.ts`)
 * imports the shared chrome + primitives from a Node runtime in PR 3.
 * If anything under `app/lib/pdf/` reaches for a browser-only global —
 * `document`, `window`, `navigator`, `Image`, `bwip-js/browser`,
 * `react-dom`, or `sonner` toast — the Node import will throw at
 * request time. This test catches the regression at unit-test time
 * instead, before the server route shows a 500.
 *
 * Two layers of defense:
 *   1. Static scan — string-match imports / refs in every file under
 *      `app/lib/pdf/`. Catches the obvious cases (`import bwipjs from
 *      "bwip-js/browser"`).
 *   2. Runtime smoke — import the barrel; jsPDF should construct a
 *      doc with zero DOM dependencies under happy-dom. If a browser
 *      global is referenced at module load, the import itself throws.
 */
// @vitest-environment node
//
// Force Node so a stray DOM reference can't quietly resolve via
// happy-dom and let a regression land.
import * as fs from "node:fs"
import * as path from "node:path"
import { describe, it, expect } from "vitest"

const PDF_LIB_DIR = path.resolve(process.cwd(), "app/lib/pdf")

const FORBIDDEN_STATIC_PATTERNS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /from\s+["']bwip-js\/browser["']/, reason: "browser-only bwip-js subpath" },
  { pattern: /from\s+["']sonner["']/, reason: "browser-only sonner (toast)" },
  {
    pattern: /from\s+["']react["']/,
    reason: "react belongs to the per-PDF builders, not the shared lib",
  },
  { pattern: /from\s+["']react-dom/, reason: "react-dom is browser-only" },
  // Require an identifier character after the period so end-of-sentence
  // mentions in JSDoc ("the document.") don't false-positive. Real DOM
  // access is always `document.body`, `document.cookie`, etc.
  { pattern: /\bdocument\.[a-zA-Z_$]/, reason: "DOM `document.*` property access" },
  { pattern: /\bwindow\.[a-zA-Z_$]/, reason: "DOM `window.*` property access" },
  { pattern: /\bnavigator\.[a-zA-Z_$]/, reason: "DOM `navigator.*` property access" },
  {
    pattern: /\bnew\s+Image\s*\(/,
    reason: "DOM `new Image()` — pass a base64 dataURL to jsPDF.addImage instead",
  },
]

/**
 * Strip line comments + block comments before scanning so JSDoc text
 * that incidentally contains `document` / `window` doesn't false-fail.
 * Naive but enough for the small `app/lib/pdf` surface.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments + JSDoc
    .replace(/\/\/.*$/gm, "") // line comments
}

function listTsFiles(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => path.join(dir, file))
}

describe("app/lib/pdf — purity guard", () => {
  it("no file imports or references a browser-only global", () => {
    const offenders: string[] = []
    for (const file of listTsFiles(PDF_LIB_DIR)) {
      const source = stripComments(fs.readFileSync(file, "utf-8"))
      for (const { pattern, reason } of FORBIDDEN_STATIC_PATTERNS) {
        if (pattern.test(source)) {
          offenders.push(`${path.basename(file)}: ${reason}`)
        }
      }
    }
    expect(
      offenders,
      `app/lib/pdf must stay Node-safe — found ${offenders.length} offenders:\n${offenders.join("\n")}`
    ).toEqual([])
  })

  it("module barrel loads cleanly in Node runtime (no DOM access at import time)", async () => {
    const mod = await import("@/app/lib/pdf")
    expect(typeof mod.drawCustomerChrome).toBe("function")
    expect(typeof mod.drawInternalChrome).toBe("function")
    expect(typeof mod.drawKpiCard).toBe("function")
    expect(typeof mod.drawRuledTable).toBe("function")
    expect(typeof mod.drawStatusChip).toBe("function")
    expect(typeof mod.drawSectionDivider).toBe("function")
    expect(typeof mod.drawLabelTopRule).toBe("function")
    expect(typeof mod.drawBarcodeHeaderBar).toBe("function")
    expect(typeof mod.ensureSpace).toBe("function")
    expect(typeof mod.stampFooter).toBe("function")
  })
})
