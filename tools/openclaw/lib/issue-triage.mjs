// Pure helpers for the v5 issue-triage path. Prompt assembly + model
// output parsing — gh API calls + retrieval orchestration live in
// `triage-issue.mjs`.
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROMPTS_DIR = resolve(__dirname, "..", "prompts")

const VALID_SEVERITIES = new Set(["P0", "P1", "P2", "P3"])
const VALID_ESTIMATES = new Set(["trivial", "S", "M", "L", "XL"])

const LIMITS = {
  issueBody: 8_000,
  retrievedChunks: 24_000, // total across all retrieved chunks
  perChunk: 4_000,
  repoOverview: 2_000,
}

function truncate(value, max, marker = "\n[…truncated…]") {
  if (typeof value !== "string") return ""
  if (value.length <= max) return value
  return value.slice(0, max - marker.length) + marker
}

/**
 * Build the issue-triage prompt. The system instructions live in
 * `prompts/issue-triage.md`; we wrap them in the per-issue context.
 *
 * @param {object} ctx
 * @param {number} ctx.issueNumber
 * @param {string} ctx.issueTitle
 * @param {string} ctx.issueBody
 * @param {string|null} ctx.issueAuthor
 * @param {string[]} [ctx.labels]
 * @param {string} [ctx.repoOverview]
 * @param {Array<{path: string, lineStart: number, lineEnd: number, content: string, score?: number}>} [ctx.retrievedChunks]
 */
export async function buildIssueTriagePrompt(ctx) {
  const systemPath = resolve(PROMPTS_DIR, "issue-triage.md")
  const system = await readFile(systemPath, "utf8")

  const sections = [
    "[SYSTEM INSTRUCTIONS]",
    system.trim(),
    "",
    "[ISSUE METADATA]",
    `Number: #${ctx.issueNumber}`,
    `Title: ${ctx.issueTitle ?? ""}`,
    `Author: ${ctx.issueAuthor ?? "(unknown)"}`,
  ]
  if (Array.isArray(ctx.labels) && ctx.labels.length > 0) {
    sections.push(`Existing labels: ${ctx.labels.join(", ")}`)
  }
  sections.push("", "Body:", truncate(ctx.issueBody ?? "(no description)", LIMITS.issueBody))

  if (ctx.repoOverview && ctx.repoOverview.trim().length > 0) {
    sections.push("", "[REPO OVERVIEW]", truncate(ctx.repoOverview, LIMITS.repoOverview))
  }

  if (Array.isArray(ctx.retrievedChunks) && ctx.retrievedChunks.length > 0) {
    sections.push(
      "",
      "[RELEVANT CODEBASE CHUNKS (semantic similarity to issue body)]",
      "Verify each is actually relevant before citing — retrieval can return false positives."
    )
    let remaining = LIMITS.retrievedChunks
    for (const chunk of ctx.retrievedChunks) {
      if (remaining <= 0) break
      const slice = truncate(chunk.content ?? "", Math.min(remaining, LIMITS.perChunk))
      remaining -= slice.length
      const span = `${chunk.path}:${chunk.lineStart}-${chunk.lineEnd}`
      const score = typeof chunk.score === "number" ? ` (score=${chunk.score.toFixed(3)})` : ""
      sections.push("", `--- ${span}${score} ---`, slice)
    }
  }

  sections.push(
    "",
    "[OUTPUT]",
    "Return only the JSON object. No prose, no Markdown fence, no array."
  )
  return sections.join("\n")
}

/**
 * Parse the model's issue-triage output. Returns null when the output
 * isn't a valid verdict object so callers can fail loudly instead of
 * posting junk. Tolerates a surrounding markdown code fence.
 */
export function parseIssueTriageResponse(text) {
  if (typeof text !== "string") return null
  let body = text.trim()
  const fence = body.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fence) body = fence[1].trim()

  let parsed
  try {
    parsed = JSON.parse(body)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null

  const headline = typeof parsed.headline === "string" ? parsed.headline.trim() : ""
  const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : ""
  const approach = typeof parsed.approach === "string" ? parsed.approach.trim() : ""
  if (!headline || !summary) return null

  const severity = typeof parsed.severity === "string" ? parsed.severity.toUpperCase() : "P2"
  const estimate = typeof parsed.estimate === "string" ? parsed.estimate : "S"
  if (!VALID_SEVERITIES.has(severity)) return null
  if (!VALID_ESTIMATES.has(estimate)) return null

  const labels = Array.isArray(parsed.labels)
    ? parsed.labels
        .filter((l) => typeof l === "string")
        .map((l) => l.trim())
        .filter(Boolean)
    : []
  const relevantFiles = Array.isArray(parsed.relevantFiles)
    ? parsed.relevantFiles.filter((p) => typeof p === "string" && p.trim().length > 0)
    : []
  const research =
    typeof parsed.research === "string" && parsed.research.trim().length > 0
      ? parsed.research.trim()
      : undefined
  const diagram =
    typeof parsed.diagram === "string" && parsed.diagram.trim().length > 0
      ? // Strip an accidental ```mermaid fence the model sometimes wraps
        // around the code despite the prompt — the formatter adds it.
        // Also strip any INTERNAL triple-backticks: Mermaid syntax doesn't
        // use backticks, so any that show up would just terminate the
        // fenced block we're about to wrap this in and corrupt the
        // rendered comment.
        parsed.diagram
          .trim()
          .replace(/^```(?:mermaid)?\s*/i, "")
          .replace(/\s*```$/i, "")
          .replace(/```+/g, "")
          .trim()
      : undefined

  return {
    headline,
    severity,
    estimate,
    labels,
    summary,
    approach,
    relevantFiles,
    research,
    diagram,
  }
}

/**
 * Render the triage object to the comment body the bot posts on the
 * issue. Greptile-style: bracketed tag, headline, technical body. The
 * `@author` mention pings the issue reporter so they see we've taken
 * a look.
 */
export function formatIssueTriageComment({ verdict, author, marker }) {
  const tag = `${verdict.severity} · ${verdict.estimate}`
  const lines = [marker]
  lines.push(`🦞 [${tag}] ${verdict.headline}`)
  lines.push("")
  if (author && !author.toLowerCase().includes("[bot]")) {
    lines.push(`@${author} — first read on your issue, hope it saves you a few minutes scoping.`)
    lines.push("")
  }
  lines.push(`**Summary:** ${verdict.summary}`)
  if (verdict.approach) {
    lines.push("")
    lines.push(`**Approach:** ${verdict.approach}`)
  }
  if (verdict.relevantFiles.length > 0) {
    lines.push("")
    lines.push("**Relevant files:**")
    for (const path of verdict.relevantFiles) lines.push(`- \`${path}\``)
  }
  if (verdict.research) {
    lines.push("")
    lines.push(`**Prior art / research:** ${verdict.research}`)
  }
  if (verdict.diagram) {
    lines.push("")
    lines.push("```mermaid")
    lines.push(verdict.diagram)
    lines.push("```")
  }
  if (verdict.labels.length > 0) {
    lines.push("")
    lines.push(`_Suggested labels:_ ${verdict.labels.map((l) => `\`${l}\``).join(", ")}`)
  }
  return lines.join("\n")
}
