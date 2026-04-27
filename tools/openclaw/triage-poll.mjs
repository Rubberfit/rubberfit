#!/usr/bin/env node
// OpenClaw v2 — long-running poller for the devops box.
//
// The Windows GPU server (which already hosts Ollama) runs this as a
// background daemon — Task Scheduler / NSSM / pm2, take your pick. It
// polls the GitHub API for open PRs whose latest CI run failed, then
// runs `triage-ci.mjs` for each one whose failed run we haven't already
// triaged.
//
// Why this and not a GitHub Action: keeps the App private key on the
// devops box and never round-trips it through GitHub-stored secrets.
// The runner is also already on the LAN with Ollama, no firewall
// holes needed.
//
// Idempotency: each PR's latest failed run id is tracked in
// `.openclaw/poll-state.json`. Re-runs against the same failure no-op
// instead of re-posting / re-spamming the comment thread.
//
// Usage:
//   node tools/openclaw/triage-poll.mjs                  # default 60s
//   OPENCLAW_POLL_INTERVAL_MS=30000 node tools/openclaw/triage-poll.mjs
//   node tools/openclaw/triage-poll.mjs --once           # one pass + exit
//
// Environment (same as triage-ci.mjs plus interval knob):
//   OLLAMA_HOST                — Ollama base URL
//   OPENCLAW_MODEL             — model tag for triage (default glm-5.1:cloud)
//   OPENCLAW_APP_ID            — GitHub App id
//   OPENCLAW_PRIVATE_KEY_PATH  — path to the App's .pem (kept local)
//   OPENCLAW_INSTALLATION_ID   — GitHub App installation id
//   OPENCLAW_POLL_INTERVAL_MS  — interval between polls (default 60_000)
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"

import { bodyMentionsBot } from "./lib/mention-detection.mjs"

const exec = promisify(execFile)

const STATE_DIR = ".openclaw"
const STATE_FILE = "poll-state.json"
const DEFAULT_INTERVAL_MS = 60_000

async function gh(args) {
  const { stdout } = await exec("gh", args, { maxBuffer: 50 * 1024 * 1024 })
  return stdout
}

function repoRoot() {
  return process.cwd()
}

/**
 * State shape v5:
 *   {
 *     handledRuns: { "<prNumber>": "<lastFailedRunId>" },
 *     handledCrComments: { "<prNumber>": <lastEvaluatedCommentId> },
 *     handledIssues: { "<issueNumber>": true },
 *     handledOverviewShas: { "<prNumber>": "<headSha>" },
 *     handledMentions: { "<commentId>": { handledAt, replyCommentId, surface } }
 *   }
 *
 * Earlier shapes only had a subset; we initialize missing fields on
 * first read so migrations are invisible. Old `handledMentions: true`
 * boolean entries are upgraded transparently on first save.
 */
const HANDLED_MENTION_TTL_MS = 180 * 24 * 60 * 60 * 1000 // 180 days

function pruneHandledMentions(handled) {
  if (!handled || typeof handled !== "object") return {}
  const now = Date.now()
  const out = {}
  for (const [id, entry] of Object.entries(handled)) {
    if (entry === true) {
      // Legacy boolean — keep without a timestamp (treated as "no expiry").
      out[id] = { handledAt: null }
      continue
    }
    if (entry && typeof entry === "object") {
      const ts = Date.parse(entry.handledAt ?? "") || 0
      if (!ts || now - ts < HANDLED_MENTION_TTL_MS) out[id] = entry
    }
  }
  return out
}

async function loadState() {
  try {
    const raw = await readFile(resolve(repoRoot(), STATE_DIR, STATE_FILE), "utf8")
    const parsed = JSON.parse(raw)
    return {
      handledRuns: parsed.handledRuns ?? {},
      handledCrComments: parsed.handledCrComments ?? {},
      handledIssues: parsed.handledIssues ?? {},
      handledOverviewShas: parsed.handledOverviewShas ?? {},
      handledMentions: pruneHandledMentions(parsed.handledMentions),
      // Cursor for the mention scan — ISO timestamp of the most recent
      // comment we've already considered. Initial scan starts 24h back
      // so the daemon doesn't replay months of history on first run.
      lastMentionScanAt: typeof parsed.lastMentionScanAt === "string" ? parsed.lastMentionScanAt : null,
    }
  } catch {
    return {
      handledRuns: {},
      handledCrComments: {},
      handledIssues: {},
      handledOverviewShas: {},
      handledMentions: {},
      lastMentionScanAt: null,
    }
  }
}

async function saveState(state) {
  const dir = resolve(repoRoot(), STATE_DIR)
  await mkdir(dir, { recursive: true })
  await writeFile(resolve(dir, STATE_FILE), JSON.stringify(state, null, 2), "utf8")
}

/**
 * List open PRs and their latest check rollup. Returns an array of
 * `{ number, latestFailedRunId | null }` so the poller can decide which
 * ones need triaging this cycle.
 */
// Track once-per-process so we don't spam the warning every poll cycle.
let warnedNoChecksScope = false

async function listOpenPrs() {
  try {
    const out = await gh([
      "pr",
      "list",
      "--state",
      "open",
      "--json",
      "number,headRefOid,statusCheckRollup",
      "--limit",
      "50",
    ])
    const prs = JSON.parse(out)
    return prs.map((pr) => {
      const failed = (pr.statusCheckRollup ?? []).find((c) => c.conclusion === "FAILURE")
      const match = failed?.detailsUrl?.match(/\/runs\/(\d+)/)
      return {
        number: pr.number,
        headSha: pr.headRefOid ?? null,
        latestFailedRunId: match ? match[1] : null,
      }
    })
  } catch (error) {
    // Fine-grained PATs without Checks:Read can't read statusCheckRollup
    // and the whole query fails. CR + issue triage don't need CI status
    // at all, so degrade gracefully: list PR numbers only, skip ci-triage
    // for this cycle, and log a one-shot warning explaining the scope gap.
    if (/Resource not accessible/i.test(String(error?.message ?? ""))) {
      if (!warnedNoChecksScope) {
        console.warn(
          "[openclaw-poll] PAT lacks Checks:Read — ci-triage disabled. Upgrade the token to include " +
            "fine-grained 'Checks: Read' (or classic 'repo') to re-enable CI failure triage."
        )
        warnedNoChecksScope = true
      }
      const out = await gh([
        "pr",
        "list",
        "--state",
        "open",
        "--json",
        "number,headRefOid",
        "--limit",
        "50",
      ])
      const prs = JSON.parse(out)
      return prs.map((pr) => ({
        number: pr.number,
        headSha: pr.headRefOid ?? null,
        latestFailedRunId: null,
      }))
    }
    throw error
  }
}

/**
 * Spawn one of the per-PR triage scripts. `kind` selects which:
 *   - "ci" → triage-ci.mjs (failure log → diagnosis comment)
 *   - "cr" → triage-cr.mjs (CR comment evaluator)
 * Inherits stdio so the poller's terminal gets the live transcript.
 */
async function runTriage(targetNumber, kind, extraArgs = []) {
  const scriptName =
    kind === "cr"
      ? "triage-cr.mjs"
      : kind === "issue"
        ? "triage-issue.mjs"
        : kind === "overview"
          ? "triage-pr-overview.mjs"
          : kind === "mention"
            ? "triage-mention.mjs"
            : "triage-ci.mjs"
  return new Promise((resolveProc) => {
    const child = execFile(
      process.execPath,
      [
        resolve(repoRoot(), "tools", "openclaw", scriptName),
        String(targetNumber),
        ...extraArgs.map(String),
      ],
      { env: process.env, maxBuffer: 50 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolveProc({ error, stdout, stderr })
      }
    )
    child.stdout?.pipe(process.stdout)
    child.stderr?.pipe(process.stderr)
  })
}

let warnedNoIssuesScope = false
let warnedNoIssueSince = false

/**
 * Resolve the cutoff Date from `OPENCLAW_ISSUE_SINCE`. Returns null when
 * the env var is unset or unparseable — callers treat null as "skip all
 * issues" (safe default: don't auto-triage the existing backlog).
 */
function getIssueSinceCutoff() {
  const raw = process.env.OPENCLAW_ISSUE_SINCE?.trim()
  if (!raw) return null
  const t = Date.parse(raw)
  return Number.isFinite(t) ? new Date(t) : null
}

/**
 * List open issues created on/after `OPENCLAW_ISSUE_SINCE`. The cutoff
 * exists so spinning up the daemon on a repo with a long-standing issue
 * backlog doesn't post a flood of triage comments retroactively. Set
 * the env var to an ISO date (e.g. `2026-04-27`) to opt issues from
 * that date forward into triage; leave it unset to skip issues entirely.
 *
 * Same scope-gap pattern as `listOpenPrs`: a fine-grained PAT without
 * Issues:Read can't run this query at all. We log once and return [].
 */
async function listOpenIssues() {
  const since = getIssueSinceCutoff()
  if (!since) {
    if (!warnedNoIssueSince) {
      console.log(
        "[openclaw-poll] OPENCLAW_ISSUE_SINCE unset — issue-triage skipped. Set to an ISO date " +
          "(e.g. 2026-04-27) to triage issues created on/after that date."
      )
      warnedNoIssueSince = true
    }
    return []
  }

  try {
    const out = await gh([
      "issue",
      "list",
      "--state",
      "open",
      "--json",
      "number,title,createdAt",
      "--limit",
      "100",
    ])
    const all = JSON.parse(out)
    return all.filter((i) => {
      const created = Date.parse(i.createdAt ?? "")
      return Number.isFinite(created) && created >= since.getTime()
    })
  } catch (error) {
    if (/Resource not accessible/i.test(String(error?.message ?? ""))) {
      if (!warnedNoIssuesScope) {
        console.warn(
          "[openclaw-poll] PAT lacks Issues:Read — issue-triage disabled. Add fine-grained " +
            "'Issues: Read' (or classic 'repo') to the token to re-enable new-issue triage."
        )
        warnedNoIssuesScope = true
      }
      return []
    }
    throw error
  }
}

/**
 * Decide whether to triage `issue` this tick. Pure for testability.
 */
export function shouldRunIssueTriage(issue, state) {
  if (!issue || typeof issue.number !== "number") return false
  return state.handledIssues?.[String(issue.number)] !== true
}

/**
 * Look up the highest-id top-level CodeRabbit review comment on the PR.
 * Used as a cheap "anything new from CR?" check — the per-comment
 * idempotency (one OpenClaw reply per CR comment) lives inside
 * triage-cr.mjs. Returns null when the PR has no CR comments yet.
 */
export async function latestCrCommentId(prNumber) {
  try {
    const out = await gh([
      "api",
      `repos/{owner}/{repo}/pulls/${prNumber}/comments`,
      "--paginate",
      "--jq",
      // Top-level CR comments only: the bot's coderabbitai login,
      // and `in_reply_to_id` null (skip nested CR follow-ups).
      '[.[] | select(.user.login | startswith("coderabbitai")) | select(.in_reply_to_id == null) | .id] | max',
    ])
    const trimmed = out.trim()
    if (!trimmed || trimmed === "null") return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * Decide whether a PR needs a CI-triage spawn this tick. Pure function
 * so it's unit-testable without a live `gh`.
 */
export function shouldRunCiTriage(pr, state) {
  if (!pr.latestFailedRunId) return false
  return state.handledRuns?.[String(pr.number)] !== pr.latestFailedRunId
}

/**
 * Decide whether a PR needs a CR-evaluator spawn this tick. Same
 * shape as `shouldRunCiTriage` for symmetry.
 */
/**
 * Decide whether to fire a PR overview this tick. Pure for testability.
 * The trigger is "head SHA is different from the last overview we
 * posted on this PR", so the very first poll after a push (or after
 * the daemon starts and finds an unhandled SHA) emits one overview
 * and then no-ops until the next push.
 */
export function shouldRunPrOverview(pr, state) {
  if (!pr || typeof pr.number !== "number") return false
  if (typeof pr.headSha !== "string" || !pr.headSha) return false
  const handled = state.handledOverviewShas?.[String(pr.number)]
  return handled !== pr.headSha
}

export function shouldRunCrTriage(pr, latestCrId, state) {
  if (latestCrId == null) return false
  const handled = state.handledCrComments?.[String(pr.number)]
  // Numeric compare: only run when CR has posted a comment newer than
  // the last one we've evaluated for this PR.
  return typeof handled !== "number" || latestCrId > handled
}

const MENTION_TRIGGER_DEFAULT = "openclaw-devops"

function getMentionSearchHandle() {
  // The Search API only matches one handle at a time. Use the first
  // configured trigger as the canonical search target — additional
  // aliases still work for *detection* inside fetched comment bodies.
  const raw = process.env.OPENCLAW_MENTION_TRIGGERS?.trim()
  if (!raw) return MENTION_TRIGGER_DEFAULT
  const first = raw.split(",")[0]?.trim()
  return first || MENTION_TRIGGER_DEFAULT
}

const KNOWN_BOT_LOGINS_SET = new Set([
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

function isKnownBotLogin(login) {
  if (typeof login !== "string") return false
  const lower = login.toLowerCase()
  return KNOWN_BOT_LOGINS_SET.has(lower) || /\[bot\]$/.test(lower)
}

/**
 * Scan all repo issue + PR top-level comments updated since the
 * given cursor for unhandled @-mentions of the bot. One paginated
 * REST call per tick — works for App-installed bots (whereas
 * Search API's `mentions:` operator does not).
 *
 * Returns `[{ commentId, askerLogin, surface, number, updatedAt }]`
 * plus the latest `updated_at` we observed (caller advances the
 * cursor).
 */
async function scanRecentMentions(state, mentionDetector) {
  // Default to 24h back on first run so we don't replay history.
  const since =
    state.lastMentionScanAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  let raw
  try {
    raw = await gh([
      "api",
      `repos/{owner}/{repo}/issues/comments?since=${encodeURIComponent(since)}&per_page=100&sort=updated&direction=asc`,
      "--paginate",
      "--jq",
      "[.[] | {id, login: .user.login, body, updated_at, issue_url}]",
    ])
  } catch (error) {
    console.warn(`[openclaw-poll] mention scan failed: ${error.message}`)
    return { matches: [], cursor: since }
  }
  let comments
  try {
    comments = JSON.parse(raw)
  } catch (error) {
    console.warn(`[openclaw-poll] mention scan parse failed: ${error.message}`)
    return { matches: [], cursor: since }
  }
  if (!Array.isArray(comments) || comments.length === 0) {
    return { matches: [], cursor: since }
  }
  const triggers = (process.env.OPENCLAW_MENTION_TRIGGERS?.split(",").map((s) => s.trim()) ?? []).filter(
    Boolean
  )
  const triggerList = triggers.length > 0 ? triggers : ["openclaw-devops", "openclaw[bot]"]
  const matches = comments
    .filter((c) => !isKnownBotLogin(c.login))
    .filter((c) => mentionDetector(c.body, triggerList))
    .filter((c) => !state.handledMentions?.[String(c.id)])
    .map((c) => {
      // issue_url ends in /issues/N or /pulls/N — we'll resolve the
      // surface in the script via a separate lookup since the issue
      // comments endpoint returns issue_url uniformly. For now treat
      // all as issue_comment; the script reads the actual type when it
      // fetches the source comment.
      const m = String(c.issue_url ?? "").match(/\/(issues|pulls)\/(\d+)/)
      const number = m ? Number(m[2]) : null
      return number == null
        ? null
        : {
            commentId: c.id,
            askerLogin: c.login,
            surface: "issue_comment", // top-level on issue OR PR; both use this REST shape
            number,
            updatedAt: c.updated_at,
          }
    })
    .filter(Boolean)
  // Advance cursor to the newest comment we observed (ISO timestamps
  // sort lexicographically). +1ms guards against re-pulling the same
  // boundary comment next tick.
  const newest = comments.reduce(
    (acc, c) => (typeof c.updated_at === "string" && c.updated_at > acc ? c.updated_at : acc),
    since
  )
  return { matches, cursor: newest }
}

async function tick() {
  const state = await loadState()
  let prs
  try {
    prs = await listOpenPrs()
  } catch (error) {
    console.error(`[openclaw-poll] gh pr list failed: ${error.message}`)
    return
  }

  for (const pr of prs) {
    // 1) CI-failure triage (v1 + v2)
    if (shouldRunCiTriage(pr, state)) {
      console.log(`[openclaw-poll] PR #${pr.number} -> CI triage (run ${pr.latestFailedRunId})`)
      const result = await runTriage(pr.number, "ci")
      // Only mark this run as handled when the child exited cleanly.
      // A failed triage (model timeout, network blip, code bug) should
      // retry on the next poll, not be silently swallowed.
      if (!result.error) {
        state.handledRuns[String(pr.number)] = pr.latestFailedRunId
        await saveState(state)
      } else {
        console.warn(
          `[openclaw-poll] CI triage failed on PR #${pr.number}; will retry next tick.`
        )
      }
    }

    // 2) PR overview (v6) — fires on every push (head SHA changed).
    // Posts a Greptile-style top-level comment summarizing the latest
    // push: summary, important files, confidence, concerns. Edited
    // in place via marker comment, so re-runs don't spam.
    if (shouldRunPrOverview(pr, state)) {
      console.log(`[openclaw-poll] PR #${pr.number} -> overview (head ${pr.headSha?.slice(0, 7)})`)
      const result = await runTriage(pr.number, "overview")
      if (!result.error) {
        state.handledOverviewShas[String(pr.number)] = pr.headSha
        await saveState(state)
      } else {
        console.warn(
          `[openclaw-poll] PR overview failed on #${pr.number}; will retry next tick.`
        )
      }
    }

    // 3) CodeRabbit-comment evaluator (v4) — only when CR has posted
    // something new since our last evaluation pass on this PR.
    const latestCrId = await latestCrCommentId(pr.number)
    if (shouldRunCrTriage(pr, latestCrId, state)) {
      console.log(`[openclaw-poll] PR #${pr.number} -> CR eval (latest comment ${latestCrId})`)
      const result = await runTriage(pr.number, "cr")
      if (!result.error) {
        state.handledCrComments[String(pr.number)] = latestCrId
        await saveState(state)
      } else {
        console.warn(
          `[openclaw-poll] CR triage failed on PR #${pr.number}; will retry next tick.`
        )
      }
    }
  }

  // 3) Issue triage (v5) — once per issue. Idempotency at both layers:
  // the local handledIssues set AND the marker comment inside the
  // script, so wiping the state file won't re-spam.
  let issues = []
  try {
    issues = await listOpenIssues()
  } catch (error) {
    console.error(`[openclaw-poll] gh issue list failed: ${error.message}`)
  }
  for (const issue of issues) {
    if (!shouldRunIssueTriage(issue, state)) continue
    console.log(`[openclaw-poll] Issue #${issue.number} -> triage (${issue.title})`)
    const result = await runTriage(issue.number, "issue")
    if (result.error) {
      console.warn(
        `[openclaw-poll] Issue triage failed on #${issue.number}; will retry next tick.`
      )
      continue
    }
    state.handledIssues[String(issue.number)] = true
    await saveState(state)
  }

  // 4) @-mention reply (v7) — single REST call returns all repo
  // issue/PR top-level comments updated since the cursor; we scan
  // those for unhandled, non-bot, real (not quoted) mentions and
  // spawn one mention reply per match. The script auto-detects
  // issue vs PR surface so we don't need to disambiguate here.
  const { matches, cursor } = await scanRecentMentions(state, bodyMentionsBot)
  for (const m of matches) {
    console.log(
      `[openclaw-poll] @-mention on #${m.number} comment ${m.commentId} (asker=${m.askerLogin})`
    )
    const result = await runTriage(m.number, "mention", [m.commentId, "auto"])
    if (result.error) {
      console.warn(
        `[openclaw-poll] Mention reply failed on #${m.number} comment ${m.commentId}; will retry next tick.`
      )
      continue
    }
    state.handledMentions[String(m.commentId)] = {
      handledAt: new Date().toISOString(),
      surface: m.surface,
    }
    await saveState(state)
  }
  // Advance cursor regardless of per-item outcomes — failures stay
  // unhandled in handledMentions, so they retry; reprocessing the
  // same comment would just hit idempotency and noop anyway.
  if (cursor && cursor !== state.lastMentionScanAt) {
    state.lastMentionScanAt = cursor
    await saveState(state)
  }
}

function parseArgs(argv) {
  return { once: argv.includes("--once") }
}

async function main() {
  const { once } = parseArgs(process.argv)
  const intervalMs = Number(process.env.OPENCLAW_POLL_INTERVAL_MS ?? DEFAULT_INTERVAL_MS)
  if (!Number.isFinite(intervalMs) || intervalMs < 5_000) {
    console.error(
      `OPENCLAW_POLL_INTERVAL_MS must be a number >= 5000 (got ${process.env.OPENCLAW_POLL_INTERVAL_MS})`
    )
    process.exit(2)
  }

  console.log(
    `[openclaw-poll] starting (interval=${intervalMs}ms, once=${once}, repo=${repoRoot()})`
  )

  while (true) {
    await tick()
    if (once) break
    await sleep(intervalMs)
  }
}

main().catch((error) => {
  console.error("[openclaw-poll] fatal:", error)
  process.exit(2)
})
