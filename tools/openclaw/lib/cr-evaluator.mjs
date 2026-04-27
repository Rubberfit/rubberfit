// Pure CR-evaluation helpers — prompt assembly + model output parsing.
// I/O (gh API calls, posting replies) lives in `triage-cr.mjs`.
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROMPTS_DIR = resolve(__dirname, "..", "prompts")

const VALID_CLASSIFICATIONS = new Set([
  "ACCEPT",
  "SKIP_NITPICK",
  "SKIP_OUT_OF_SCOPE",
  "SKIP_FALSE_POSITIVE",
])

const LIMITS = {
  prDiff: 16_000,
  prBody: 4_000,
  commentBody: 2_000, // per CR comment — they include suggested-edit blocks that get long
  totalComments: 60_000, // hard cap across all comment bodies in one prompt
  fileContext: 1_500, // per-comment file context (±20 lines around the line)
}

const FILE_CONTEXT_RADIUS = 20 // lines above + below the affected line

function truncate(value, max, marker = "\n[…truncated…]") {
  if (typeof value !== "string") return ""
  if (value.length <= max) return value
  return value.slice(0, max - marker.length) + marker
}

/**
 * Render a CR comment for inclusion in the evaluator prompt. Strips any
 * outer details/summary blocks CR uses to fold the AI-prompt section
 * (we want the model focused on the human-facing comment, not on a CR
 * sub-prompt that says "verify each finding…").
 *
 * When a `fileContext` slice is attached, the surrounding lines render
 * underneath the comment body so the model can write a precise,
 * line-anchored reply instead of a generic "consider X" hand-wave.
 */
function renderCommentForPrompt(index, comment) {
  const body = truncate(stripCRAgentPrompt(comment.body ?? ""), LIMITS.commentBody)
  const line = comment.line ?? comment.original_line ?? "?"
  const sections = [`[${index + 1}] commentId=${comment.id} ${comment.path}:${line}`, "Body:", body]
  if (typeof comment.fileContext === "string" && comment.fileContext.length > 0) {
    sections.push(
      "",
      `File context (${comment.path}, around line ${line}):`,
      "```",
      truncate(comment.fileContext, LIMITS.fileContext),
      "```"
    )
  }
  return sections.join("\n")
}

/**
 * Slice ±radius lines around `line` from `content`. 1-based line input;
 * returns the slice prefixed with line numbers so the model can quote
 * specific lines accurately. Returns the empty string when the input
 * is empty or `line` is non-numeric.
 */
export function extractFileContext(content, line, radius = FILE_CONTEXT_RADIUS) {
  if (typeof content !== "string" || content.length === 0) return ""
  const lineNum = Number(line)
  if (!Number.isFinite(lineNum) || lineNum <= 0) return ""
  const lines = content.split("\n")
  const start = Math.max(0, lineNum - 1 - radius)
  const end = Math.min(lines.length, lineNum + radius)
  const width = String(end).length
  const out = []
  for (let i = start; i < end; i++) {
    const number = String(i + 1).padStart(width, " ")
    const marker = i + 1 === lineNum ? ">" : " "
    out.push(`${marker} ${number}: ${lines[i]}`)
  }
  return out.join("\n")
}

/**
 * CodeRabbit's review comment bodies sometimes include a "🤖 Prompt for AI
 * Agents" section with model instructions of their own. We don't want that
 * leaking into our model's prompt — strip it. Returns the human-facing
 * portion of the comment.
 */
export function stripCRAgentPrompt(body) {
  if (typeof body !== "string") return ""
  // CR uses `<details><summary>🤖 Prompt for AI Agents</summary>` blocks.
  return body.replace(
    /<details>\s*<summary>[^<]*Prompt for AI Agents[^<]*<\/summary>[\s\S]*?<\/details>/gi,
    ""
  )
}

/**
 * Build the full evaluator prompt. The system instructions live in
 * `prompts/cr-evaluation.md`; this assembles the per-PR context around
 * them.
 *
 * @param {object} ctx
 * @param {number} ctx.prNumber
 * @param {string} ctx.prTitle
 * @param {string} ctx.prBody
 * @param {string} ctx.prDiff
 * @param {Array<{id: number, path: string, line?: number, original_line?: number, body: string}>} ctx.comments
 */
export async function buildEvaluatorPrompt(ctx) {
  const systemPath = resolve(PROMPTS_DIR, "cr-evaluation.md")
  const system = await readFile(systemPath, "utf8")

  const sections = [
    "[SYSTEM INSTRUCTIONS]",
    system.trim(),
    "",
    "[PR SCOPE]",
    `Number: #${ctx.prNumber}`,
    `Title: ${ctx.prTitle}`,
    "Body:",
    truncate(ctx.prBody ?? "(no description)", LIMITS.prBody),
    "",
    "[PR DIFF (truncated)]",
    truncate(ctx.prDiff ?? "", LIMITS.prDiff),
    "",
    "[CR COMMENTS TO EVALUATE]",
  ]

  let remaining = LIMITS.totalComments
  const rendered = []
  for (let i = 0; i < (ctx.comments ?? []).length; i++) {
    if (remaining <= 0) break
    const block = renderCommentForPrompt(i, ctx.comments[i])
    rendered.push(block)
    remaining -= block.length
  }
  sections.push(rendered.join("\n\n"))

  sections.push("", "[OUTPUT]", "Return only the JSON array. No prose, no Markdown fence.")
  return sections.join("\n")
}

/**
 * Parse the model's evaluator output into typed verdicts. Tolerates a
 * surrounding markdown code fence (the model occasionally wraps despite
 * instructions). Returns null for any output that isn't a JSON array of
 * verdicts so callers can fail loudly rather than post junk.
 */
export function parseEvaluatorResponse(text) {
  if (typeof text !== "string") return null
  // Strip a surrounding ```json … ``` or ``` … ``` fence if present.
  let body = text.trim()
  const fence = body.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fence) body = fence[1].trim()

  let parsed
  try {
    parsed = JSON.parse(body)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null

  const result = []
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") return null
    const commentId = Number(entry.commentId)
    const classification = entry.classification
    if (!Number.isFinite(commentId)) return null
    if (typeof classification !== "string" || !VALID_CLASSIFICATIONS.has(classification)) {
      return null
    }
    // Schema accepts both the new (headline+body) shape and the legacy
    // (reason+suggestion+skipReply) shape so a slow model rollout — or a
    // reviewer wired up against an older prompt — doesn't break parsing.
    const headline = typeof entry.headline === "string" ? entry.headline.trim() : ""
    const body =
      typeof entry.body === "string"
        ? entry.body
        : typeof entry.reason === "string"
          ? entry.reason
          : ""
    result.push({
      commentId,
      classification,
      headline,
      body,
      location: typeof entry.location === "string" ? entry.location : undefined,
      // Per-comment opener clause (no @author — the formatter prepends
      // the mention). When unset, the formatter falls back to a static
      // line; when set, each ACCEPT reply carries its own framing
      // tailored to the specific finding.
      opener:
        typeof entry.opener === "string" && entry.opener.trim().length > 0
          ? entry.opener.trim()
          : undefined,
      // Legacy fields kept around so existing tests / callers don't break;
      // new code should prefer headline + body.
      reason: typeof entry.reason === "string" ? entry.reason : body,
      suggestion: typeof entry.suggestion === "string" ? entry.suggestion : undefined,
      skipReply: typeof entry.skipReply === "string" ? entry.skipReply : undefined,
    })
  }
  return result
}
