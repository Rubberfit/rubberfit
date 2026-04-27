// Pure prompt builder for the OpenClaw CI triage tool.
// Kept separate from triage-ci.mjs so the prompt construction is unit-testable
// without spinning up the gh CLI or Ollama.
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))

const PROMPTS_DIR = resolve(__dirname, "..", "prompts")

/**
 * Hard cap on prompt budget. GLM-5.1:cloud handles large contexts but we
 * still want to leave room for the response and avoid latency cliffs. The
 * limits below are character-based — rough proxies, not token-exact, but
 * good enough to keep us comfortably under model limits.
 */
const LIMITS = {
  prDiff: 20_000,
  ciLog: 12_000,
  fileContext: 30_000, // total across all included files
  prBody: 4_000,
}

/**
 * Truncate `value` to `max` chars, appending a marker so the model knows
 * content was cut. Returns the original when already short enough.
 */
export function truncate(value, max, marker = "\n[…truncated…]") {
  if (typeof value !== "string") return ""
  if (value.length <= max) return value
  return value.slice(0, max - marker.length) + marker
}

/**
 * Heuristic: extract distinct file paths the failure log mentions. Looks for
 * `<path>:<line>:<col>` and `<path>:<line>` patterns common to TS / Vitest /
 * ESLint output. Returns deduplicated paths in first-mention order.
 */
export function extractMentionedFiles(log) {
  if (typeof log !== "string" || log.length === 0) return []
  // Match repo-relative-ish paths: at least one slash, file extension, then a
  // colon + line number. Anchored by a word boundary or whitespace to avoid
  // grabbing fragments mid-token.
  const pattern =
    /(?:^|[\s(])((?:[\w.-]+\/)+[\w.-]+\.(?:ts|tsx|mjs|js|jsx|rs|md|yml|yaml|json|sh)):(\d+)/g
  const seen = new Set()
  const ordered = []
  let match
  while ((match = pattern.exec(log)) !== null) {
    const path = match[1]
    if (!seen.has(path)) {
      seen.add(path)
      ordered.push(path)
    }
  }
  return ordered
}

/**
 * Build the user-facing prompt body that's sent to the model. The system
 * instructions live in `prompts/ci-triage.md` and are loaded once.
 *
 * @param {object} ctx
 * @param {string} ctx.prTitle
 * @param {string} ctx.prBody
 * @param {number} ctx.prNumber
 * @param {string} ctx.prDiff
 * @param {string} ctx.ciLog
 * @param {Array<{path: string, content: string}>} ctx.fileContexts
 */
export async function buildTriagePrompt(ctx) {
  const systemPath = resolve(PROMPTS_DIR, "ci-triage.md")
  const system = await readFile(systemPath, "utf8")

  const sections = [
    "[SYSTEM INSTRUCTIONS]",
    system.trim(),
    "",
    "[PR METADATA]",
    `Number: #${ctx.prNumber}`,
    `Title: ${ctx.prTitle}`,
    "",
    "Body:",
    truncate(ctx.prBody ?? "(no description)", LIMITS.prBody),
    "",
    "[PR DIFF (truncated)]",
    truncate(ctx.prDiff ?? "", LIMITS.prDiff),
    "",
    "[FAILED CI LOG (filtered to failed steps, truncated)]",
    truncate(ctx.ciLog ?? "", LIMITS.ciLog),
  ]

  if (Array.isArray(ctx.fileContexts) && ctx.fileContexts.length > 0) {
    sections.push("", "[AFFECTED FILE CONTEXT]")
    let remaining = LIMITS.fileContext
    for (const file of ctx.fileContexts) {
      if (remaining <= 0) {
        sections.push(
          `(omitted ${ctx.fileContexts.length - sections.filter((s) => s.startsWith("--- ")).length} more files due to context budget)`
        )
        break
      }
      const slice = truncate(file.content ?? "", Math.min(remaining, 8_000))
      remaining -= slice.length
      sections.push(`--- ${file.path} ---`, slice, "")
    }
  }

  sections.push(
    "",
    "[OUTPUT]",
    "Produce the comment in the exact format specified above. No preamble."
  )

  return sections.join("\n")
}

/**
 * Parse the model's confidence rating out of its response. Returns one of
 * 'high' | 'medium' | 'low' | null. The prompt instructs the model to put
 * "**Confidence:** <level>" near the end of the comment; in practice the
 * model wraps the level in various decorations (`high`, _medium_, etc.)
 * and intersperses asterisks around `Confidence` itself. Strip markdown
 * formatting first, then match — robust against minor reordering.
 */
export function parseConfidence(modelResponse) {
  if (typeof modelResponse !== "string") return null
  const stripped = modelResponse.replace(/[*_`]/g, "")
  const match = stripped.match(/Confidence:\s*(high|medium|low)\b/i)
  if (!match) return null
  return match[1].toLowerCase()
}
