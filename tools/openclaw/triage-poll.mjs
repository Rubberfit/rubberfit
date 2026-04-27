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
// `.openclaw/state.json`. Re-runs against the same failure no-op
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
 * State shape v3:
 *   {
 *     handledRuns: { "<prNumber>": "<lastFailedRunId>" },
 *     handledCrComments: { "<prNumber>": <lastEvaluatedCommentId> },
 *     handledIssues: { "<issueNumber>": true }
 *   }
 *
 * Earlier shapes only had a subset; we initialize missing fields on
 * first read so migrations are invisible.
 */
async function loadState() {
  try {
    const raw = await readFile(resolve(repoRoot(), STATE_DIR, STATE_FILE), "utf8")
    const parsed = JSON.parse(raw)
    return {
      handledRuns: parsed.handledRuns ?? {},
      handledCrComments: parsed.handledCrComments ?? {},
      handledIssues: parsed.handledIssues ?? {},
    }
  } catch {
    return { handledRuns: {}, handledCrComments: {}, handledIssues: {} }
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
      "number,statusCheckRollup",
      "--limit",
      "50",
    ])
    const prs = JSON.parse(out)
    return prs.map((pr) => {
      const failed = (pr.statusCheckRollup ?? []).find((c) => c.conclusion === "FAILURE")
      const match = failed?.detailsUrl?.match(/\/runs\/(\d+)/)
      return {
        number: pr.number,
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
      const out = await gh(["pr", "list", "--state", "open", "--json", "number", "--limit", "50"])
      const prs = JSON.parse(out)
      return prs.map((pr) => ({ number: pr.number, latestFailedRunId: null }))
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
async function runTriage(targetNumber, kind) {
  const scriptName =
    kind === "cr" ? "triage-cr.mjs" : kind === "issue" ? "triage-issue.mjs" : "triage-ci.mjs"
  return new Promise((resolveProc) => {
    const child = execFile(
      process.execPath,
      [resolve(repoRoot(), "tools", "openclaw", scriptName), String(targetNumber)],
      { env: process.env, maxBuffer: 50 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolveProc({ error, stdout, stderr })
      }
    )
    child.stdout?.pipe(process.stdout)
    child.stderr?.pipe(process.stderr)
  })
}

/**
 * List open issues that we haven't triaged yet. Returns minimal shape
 * for the poller's decision logic; the actual triage call fetches the
 * issue body via `gh issue view` itself.
 */
async function listOpenIssues() {
  const out = await gh([
    "issue",
    "list",
    "--state",
    "open",
    "--json",
    "number,title",
    "--limit",
    "50",
  ])
  return JSON.parse(out)
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
export function shouldRunCrTriage(pr, latestCrId, state) {
  if (latestCrId == null) return false
  const handled = state.handledCrComments?.[String(pr.number)]
  // Numeric compare: only run when CR has posted a comment newer than
  // the last one we've evaluated for this PR.
  return typeof handled !== "number" || latestCrId > handled
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
      await runTriage(pr.number, "ci")
      state.handledRuns[String(pr.number)] = pr.latestFailedRunId
      await saveState(state)
    }

    // 2) CodeRabbit-comment evaluator (v4) — only when CR has posted
    // something new since our last evaluation pass on this PR.
    const latestCrId = await latestCrCommentId(pr.number)
    if (shouldRunCrTriage(pr, latestCrId, state)) {
      console.log(`[openclaw-poll] PR #${pr.number} -> CR eval (latest comment ${latestCrId})`)
      await runTriage(pr.number, "cr")
      state.handledCrComments[String(pr.number)] = latestCrId
      await saveState(state)
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
    await runTriage(issue.number, "issue")
    state.handledIssues[String(issue.number)] = true
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
