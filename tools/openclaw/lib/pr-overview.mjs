// Pure helpers for the PR-overview triage (v6) — prompt assembly,
// model-output parsing, and comment formatting. No live model, no
// GitHub access. Mirrors the issue-triage.mjs shape for testability.
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROMPTS_DIR = resolve(__dirname, "..", "prompts")

const LIMITS = {
  prDiff: 28_000, // big enough to fit most pushes; the 5-min model timeout is the harder ceiling
  prBody: 4_000,
  newCommitsBlock: 2_000,
}

function truncate(text, max) {
  if (typeof text !== "string") return ""
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n[... truncated ${text.length - max} chars ...]`
}

/**
 * Build the full overview prompt from the latest push context.
 *
 * @param {object} ctx
 * @param {number} ctx.prNumber
 * @param {string} ctx.prTitle
 * @param {string} ctx.prBody
 * @param {string} ctx.diff       Diff for the latest push (or full PR diff for the first run)
 * @param {Array<{sha: string, message: string}>} ctx.newCommits  Commits since the last overview
 * @param {boolean} ctx.isFirstRun  True when no prior overview exists for this PR
 */
export async function buildOverviewPrompt(ctx) {
  const systemPath = resolve(PROMPTS_DIR, "pr-overview.md")
  const system = await readFile(systemPath, "utf8")

  const commitsBlock = (ctx.newCommits ?? [])
    .map((c) => `- ${c.sha?.slice(0, 7) ?? "?"} ${c.message?.split("\n")[0] ?? ""}`)
    .join("\n")

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
    ctx.isFirstRun
      ? "[FULL PR DIFF — first overview, summarize the whole change]"
      : "[NEW COMMITS — only summarize what's been pushed since the previous overview]",
    truncate(commitsBlock, LIMITS.newCommitsBlock),
    "",
    "[DIFF]",
    truncate(ctx.diff ?? "", LIMITS.prDiff),
    "",
    "[OUTPUT]",
    "Return only the JSON object. No prose, no Markdown fence, no array.",
  ]

  return sections.join("\n")
}

/**
 * Parse the model's overview response into a typed object. Tolerates a
 * surrounding markdown fence. Returns null for any output that isn't
 * the expected shape so callers can fail loudly rather than post junk.
 */
export function parseOverviewResponse(text) {
  if (typeof text !== "string") return null
  let trimmed = text.trim()
  // Strip ```json ... ``` fence if the model added one despite instructions.
  trimmed = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
  let parsed
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null

  const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : ""
  if (!summary) return null

  const confidence = Number(parsed.confidence)
  if (!Number.isFinite(confidence) || confidence < 1 || confidence > 5) return null

  const files = Array.isArray(parsed.files)
    ? parsed.files
        .filter((f) => f && typeof f.path === "string" && f.path.trim())
        .slice(0, 5)
        .map((f) => ({
          path: f.path.trim(),
          score: Number.isFinite(Number(f.score))
            ? Math.max(1, Math.min(5, Math.round(Number(f.score))))
            : 3,
          overview: typeof f.overview === "string" ? f.overview.trim() : "",
          nextStep: typeof f.nextStep === "string" ? f.nextStep.trim() : "",
        }))
    : []

  const bullets = Array.isArray(parsed.bullets)
    ? parsed.bullets.filter((b) => typeof b === "string" && b.trim()).map((b) => b.trim())
    : []

  const confidenceReason =
    typeof parsed.confidenceReason === "string" ? parsed.confidenceReason.trim() : ""

  return {
    summary,
    files,
    confidence: Math.round(confidence),
    confidenceReason,
    bullets,
  }
}

/**
 * Render the parsed verdict into a Greptile-style markdown comment.
 * The marker on line 1 is what `findExistingOverview` greps for to
 * decide between POST-new and PATCH-in-place.
 */
export function formatOverviewComment({ verdict, marker, isFirstRun }) {
  const lines = [marker]
  lines.push("")
  lines.push("## OpenClaw Overview")
  lines.push("")
  lines.push(`### Summary${isFirstRun ? "" : " — latest push"}`)
  lines.push("")
  lines.push(verdict.summary)

  if (verdict.files.length > 0) {
    lines.push("")
    lines.push("### Important files")
    lines.push("")
    lines.push("| File | Score | Notes | Next step |")
    lines.push("| --- | :---: | --- | --- |")
    for (const f of verdict.files) {
      lines.push(
        `| \`${f.path}\` | ${f.score}/5 | ${f.overview || "—"} | ${f.nextStep || "—"} |`
      )
    }
  }

  lines.push("")
  lines.push(`### Confidence: ${verdict.confidence}/5`)
  if (verdict.confidenceReason) {
    lines.push("")
    lines.push(verdict.confidenceReason)
  }

  if (verdict.bullets.length > 0) {
    lines.push("")
    for (const b of verdict.bullets) {
      lines.push(`- ${b}`)
    }
  }

  return lines.join("\n")
}
