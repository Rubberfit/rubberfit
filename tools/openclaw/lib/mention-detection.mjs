// Pure helpers for OpenClaw v7 — detect @-mentions in issue/PR
// comments, build the prompt, parse the model's reply, format the
// posted comment. No live model, no GitHub access. Mirrors the
// shape of issue-triage.mjs / cr-evaluator.mjs.
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROMPTS_DIR = resolve(__dirname, "..", "prompts")

const LIMITS = {
  threadComment: 1_000,
  recentComments: 10,
  prDiff: 12_000,
  retrievalChunks: 6_000,
}

const DEFAULT_TRIGGERS = ["openclaw-devops", "openclaw[bot]"]

const KNOWN_BOT_LOGINS = new Set([
  "coderabbitai",
  "coderabbitai[bot]",
  "openclaw-devops",
  "openclaw[bot]",
  "github-actions",
  "github-actions[bot]",
  "vercel",
  "vercel[bot]",
  "dependabot",
  "dependabot[bot]",
])

/**
 * Resolve the list of mention trigger handles. Configurable via
 * `OPENCLAW_MENTION_TRIGGERS=alias1,alias2`; default covers the App
 * slug AND the GitHub-Apps `[bot]` form so users can @ either one.
 */
export function getMentionTriggers() {
  const raw = process.env.OPENCLAW_MENTION_TRIGGERS?.trim()
  if (!raw) return DEFAULT_TRIGGERS
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Strip markdown blockquotes and fenced code blocks from a comment
 * body so a quoted prior message that mentioned the bot doesn't
 * re-trigger us. Common case: someone hits "Quote reply" on the
 * original mention and posts a reply without re-mentioning us.
 */
export function stripQuotesAndCode(body) {
  if (typeof body !== "string") return ""
  // Remove fenced code blocks (greedy across newlines, non-greedy on length)
  let out = body.replace(/```[\s\S]*?```/g, "")
  // Remove single-line blockquotes (`> ...`)
  out = out
    .split("\n")
    .filter((line) => !/^\s*>/.test(line))
    .join("\n")
  return out
}

/**
 * Returns true if the (cleaned) body contains a real mention of any
 * of the configured trigger aliases. Avoids matching email-like
 * suffixes ("openclaw-devops@...") and inline code.
 */
export function bodyMentionsBot(body, triggers = getMentionTriggers()) {
  const cleaned = stripQuotesAndCode(body)
  for (const handle of triggers) {
    // GitHub renders [bot] suffix literally; escape brackets for regex.
    const escaped = handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const re = new RegExp(`(^|[^a-zA-Z0-9_/-])@${escaped}(?![a-zA-Z0-9._-])`, "i")
    if (re.test(cleaned)) return true
  }
  return false
}

export function isKnownBotAuthor(login) {
  if (typeof login !== "string") return false
  const lower = login.toLowerCase()
  if (KNOWN_BOT_LOGINS.has(lower)) return true
  // Anything ending in [bot] is by GitHub convention an App-installed bot.
  if (/\[bot\]$/.test(lower)) return true
  return false
}

/**
 * Strip the @-mention itself from the question body so the prompt
 * gets clean text. Handles both `@openclaw-devops` and `@openclaw[bot]`.
 */
export function stripMentionFromBody(body, triggers = getMentionTriggers()) {
  if (typeof body !== "string") return ""
  let out = body
  for (const handle of triggers) {
    const escaped = handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const re = new RegExp(`@${escaped}\\s*,?\\s*`, "gi")
    out = out.replace(re, "")
  }
  return out.trim()
}

function truncate(text, max) {
  if (typeof text !== "string") return ""
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n[... truncated ${text.length - max} chars ...]`
}

/**
 * Build the model prompt for a mention reply. `surface` is
 * `issue_comment` or `pr_comment`. The author's @-mention has
 * already been stripped from `question`.
 */
export async function buildMentionPrompt(ctx) {
  const systemPath = resolve(PROMPTS_DIR, "mention-reply.md")
  const system = await readFile(systemPath, "utf8")

  const recent = (ctx.recentComments ?? [])
    .slice(-LIMITS.recentComments)
    .map((c) => `[${c.author}] ${truncate(c.body ?? "", LIMITS.threadComment)}`)
    .join("\n\n---\n\n")

  const chunks = (ctx.retrievedChunks ?? [])
    .map(
      (c) =>
        `--- ${c.path}:${c.lineStart}-${c.lineEnd} (score=${typeof c.score === "number" ? c.score.toFixed(2) : "?"})\n${c.content}`
    )
    .join("\n\n")

  const sections = [
    "[SYSTEM INSTRUCTIONS]",
    system.trim(),
    "",
    "[SURFACE]",
    `Type: ${ctx.surface}`,
    `Number: #${ctx.number}`,
    `Title: ${ctx.title}`,
    "",
    "[ASKER]",
    `@${ctx.askerLogin}`,
    "",
    "[QUESTION]",
    truncate(ctx.question ?? "", LIMITS.threadComment * 2),
    "",
  ]

  if (recent) {
    sections.push("[RECENT THREAD CONTEXT — chronological]")
    sections.push(recent)
    sections.push("")
  }

  if (ctx.surface === "pr_comment" && ctx.prDiff) {
    sections.push("[PR DIFF (truncated)]")
    sections.push(truncate(ctx.prDiff, LIMITS.prDiff))
    sections.push("")
  }

  if (chunks) {
    sections.push("[RELEVANT CODEBASE CHUNKS]")
    sections.push(truncate(chunks, LIMITS.retrievalChunks))
    sections.push("")
  }

  sections.push("[OUTPUT]", "Return only the JSON object. No prose, no Markdown fence.")
  return sections.join("\n")
}

/**
 * Parse the model's reply. Tolerates a surrounding ```json fence.
 * Returns null for malformed output.
 */
export function parseMentionResponse(text) {
  if (typeof text !== "string") return null
  let trimmed = text.trim()
  trimmed = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
  let parsed
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null

  const answer = typeof parsed.answer === "string" ? parsed.answer.trim() : ""
  if (!answer) return null

  const confidence = Number(parsed.confidence)
  const abstain = Boolean(parsed.abstain)
  return {
    answer,
    confidence:
      Number.isFinite(confidence) && confidence >= 1 && confidence <= 5
        ? Math.round(confidence)
        : 3,
    abstain,
  }
}

/**
 * Render the verdict to the comment body OpenClaw posts. The
 * bracketed marker on line 1 is what `findExistingMentionReply`
 * greps for to skip re-replies on the same source comment.
 */
export function formatMentionReply({ verdict, askerLogin, sourceCommentId, marker }) {
  const lines = [`${marker}${sourceCommentId} -->`]
  lines.push(`@${askerLogin} 🦞`)
  lines.push("")
  lines.push(verdict.answer)
  return lines.join("\n")
}
