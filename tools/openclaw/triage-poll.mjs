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

async function loadState() {
  try {
    const raw = await readFile(resolve(repoRoot(), STATE_DIR, STATE_FILE), "utf8")
    return JSON.parse(raw)
  } catch {
    return { handledRuns: {} }
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
async function listOpenPrs() {
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
}

async function runTriage(prNumber) {
  // Spawn the existing triage script as a child so any future logic
  // changes flow through one entry point. Inheriting stdio gives the
  // poller's terminal a live transcript of what was diagnosed.
  return new Promise((resolveProc) => {
    const child = execFile(
      process.execPath,
      [resolve(repoRoot(), "tools", "openclaw", "triage-ci.mjs"), String(prNumber)],
      { env: process.env, maxBuffer: 50 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolveProc({ error, stdout, stderr })
      }
    )
    child.stdout?.pipe(process.stdout)
    child.stderr?.pipe(process.stderr)
  })
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
    if (!pr.latestFailedRunId) continue
    const handledRunId = state.handledRuns[String(pr.number)]
    if (handledRunId === pr.latestFailedRunId) continue

    console.log(`[openclaw-poll] PR #${pr.number} → triaging run ${pr.latestFailedRunId}`)
    await runTriage(pr.number)
    state.handledRuns[String(pr.number)] = pr.latestFailedRunId
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
