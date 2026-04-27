#!/usr/bin/env node
// OpenClaw v6 — Greptile-style top-level PR overview comment.
//
// Fires after each push: summarizes what changed, flags important
// files with review scores, scores overall confidence, and lists
// concerns the reviewer must scrutinize. Posts as a single
// top-level PR comment, edited in place on subsequent pushes via
// the `<!-- openclaw:pr-overview -->` marker.
//
// Usage:
//   node tools/openclaw/triage-pr-overview.mjs <pr-number>
//
// Auth: posts as @openclaw[bot] when App auth is configured. Falls
// back to gh CLI under the developer's identity for local manual runs.
import { execFile } from "node:child_process"
import { promisify } from "node:util"

import {
  buildOverviewPrompt,
  formatOverviewComment,
  parseOverviewResponse,
} from "./lib/pr-overview.mjs"
import { ensureModelAvailable, generate } from "./lib/ollama.mjs"
import { getInstallationToken, isAppAuthConfigured } from "./lib/github-app.mjs"
import { getOwnerRepo } from "./lib/comments.mjs"

const exec = promisify(execFile)
const MODEL = process.env.OPENCLAW_MODEL ?? "glm-5.1:cloud"
const GITHUB_API = "https://api.github.com"
const OVERVIEW_MARKER = "<!-- openclaw:pr-overview -->"

async function gh(args) {
  const { stdout } = await exec("gh", args, { maxBuffer: 50 * 1024 * 1024 })
  return stdout
}

async function fetchPrContext(prNumber) {
  const meta = JSON.parse(
    await gh(["pr", "view", String(prNumber), "--json", "title,body,author,headRefOid"])
  )
  const diff = await gh(["pr", "diff", String(prNumber)])
  return {
    title: meta.title,
    body: meta.body,
    author: meta.author?.login ?? null,
    headSha: meta.headRefOid,
    diff,
  }
}

async function fetchRecentCommits(prNumber, limit = 10) {
  try {
    const out = await gh([
      "pr",
      "view",
      String(prNumber),
      "--json",
      "commits",
      "--jq",
      `[.commits[-${limit}:][] | {sha: .oid, message: .messageHeadline}]`,
    ])
    const arr = JSON.parse(out)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

async function buildAppCallable() {
  if (!isAppAuthConfigured()) return null
  const token = await getInstallationToken()
  if (!token) return null
  return async function call(method, path, body) {
    const res = await fetch(`${GITHUB_API}${path}`, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `token ${token}`,
        "x-github-api-version": "2022-11-28",
        "content-type": "application/json",
      },
      body: body == null ? undefined : JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`${method} ${path} failed (HTTP ${res.status}): ${text.slice(0, 300)}`)
    }
    if (res.status === 204) return null
    return res.json()
  }
}

async function findExistingOverview(call, ownerRepo, prNumber) {
  if (!call) return null
  let page = 1
  while (true) {
    const items = await call(
      "GET",
      `/repos/${ownerRepo}/issues/${prNumber}/comments?per_page=100&page=${page}`
    )
    if (!Array.isArray(items) || items.length === 0) return null
    const hit = items.find((c) => typeof c.body === "string" && c.body.includes(OVERVIEW_MARKER))
    if (hit) return hit.id
    if (items.length < 100) return null
    page += 1
  }
}

async function postOrUpdateOverview(prNumber, body) {
  const ownerRepo = await getOwnerRepo()
  const call = await buildAppCallable()
  if (call) {
    const existing = await findExistingOverview(call, ownerRepo, prNumber)
    if (existing != null) {
      await call("PATCH", `/repos/${ownerRepo}/issues/comments/${existing}`, { body })
      return { mode: "updated", commentId: existing, identity: "bot" }
    }
    const created = await call("POST", `/repos/${ownerRepo}/issues/${prNumber}/comments`, {
      body,
    })
    return { mode: "created", commentId: created?.id ?? null, identity: "bot" }
  }
  // gh CLI fallback for local manual runs.
  const stdout = await gh([
    "api",
    `repos/${ownerRepo}/issues/${prNumber}/comments`,
    "--paginate",
    "--jq",
    `[.[] | select(.body | contains("${OVERVIEW_MARKER}")) | .id] | first // empty`,
  ])
  const trimmed = stdout.trim()
  const existingId = trimmed === "" ? null : Number(trimmed)
  if (existingId != null) {
    await gh([
      "api",
      "-X",
      "PATCH",
      `repos/${ownerRepo}/issues/comments/${existingId}`,
      "-f",
      `body=${body}`,
    ])
    return { mode: "updated", commentId: existingId, identity: "user" }
  }
  await gh(["pr", "comment", String(prNumber), "--body", body])
  return { mode: "created", commentId: null, identity: "user" }
}

async function main() {
  const arg = process.argv[2]
  if (!arg || !/^\d+$/.test(arg)) {
    console.error("Usage: node tools/openclaw/triage-pr-overview.mjs <pr-number>")
    process.exit(2)
  }
  const prNumber = Number(arg)

  console.log(`[pr-overview] PR #${prNumber}: pre-flight model check...`)
  try {
    await ensureModelAvailable(MODEL)
  } catch (error) {
    console.error(`OpenClaw pre-flight failed: ${error.message}`)
    process.exit(2)
  }

  console.log(`[pr-overview] PR #${prNumber}: fetching PR context (title/body/diff/sha)...`)
  const prCtx = await fetchPrContext(prNumber)
  const newCommits = await fetchRecentCommits(prNumber, 10)

  // First-run detection: if no overview comment exists yet, summarize
  // the whole PR. Otherwise focus on what's new since the last
  // overview.
  const ownerRepo = await getOwnerRepo()
  const callForCheck = await buildAppCallable()
  const existingId = await findExistingOverview(callForCheck, ownerRepo, prNumber)
  const isFirstRun = existingId == null

  console.log(
    `[pr-overview] PR #${prNumber}: building prompt (${isFirstRun ? "first overview" : "incremental"}, ${newCommits.length} commit(s) listed)...`
  )
  const prompt = await buildOverviewPrompt({
    prNumber,
    prTitle: prCtx.title,
    prBody: prCtx.body,
    diff: prCtx.diff,
    newCommits,
    isFirstRun,
  })

  console.log(
    `[pr-overview] PR #${prNumber}: calling ${MODEL} with ${prompt.length}-char prompt...`
  )
  const t0 = Date.now()
  const response = await generate({ model: MODEL, prompt, temperature: 0.2 })
  console.log(
    `[pr-overview] PR #${prNumber}: model returned in ${Math.round((Date.now() - t0) / 1000)}s`
  )

  const verdict = parseOverviewResponse(response)
  if (!verdict) {
    console.error("Model output did not parse as a valid overview verdict; raw output below:\n")
    console.error(response)
    process.exit(2)
  }

  const body = `${formatOverviewComment({
    verdict,
    marker: OVERVIEW_MARKER,
    isFirstRun,
  })}\n\n_🦞 Auto-overview by **OpenClaw** · model \`${MODEL}\` · confidence \`${verdict.confidence}/5\`_`

  const result = await postOrUpdateOverview(prNumber, body)
  console.log(
    `PR overview ${result.mode} on #${prNumber} as ${result.identity} (confidence=${verdict.confidence}/5, ${verdict.files.length} files flagged)`
  )
}

main().catch((error) => {
  console.error("OpenClaw PR overview failed:", error)
  process.exit(2)
})
