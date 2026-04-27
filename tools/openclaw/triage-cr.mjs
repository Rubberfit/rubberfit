#!/usr/bin/env node
// OpenClaw v4 — CR comment evaluator + suggestion-fix poster.
//
// CodeRabbit posts a lot of comments. Some are real (bugs, security,
// missing error handling). Many are nitpicks ("consider extracting…"),
// out-of-scope suggestions, or false positives that misread the
// codebase. Engineers who apply every CR comment at face value end up
// chasing churn instead of shipping.
//
// This script reads every open CR comment on a PR, asks GLM-5.1:cloud
// to classify each one (ACCEPT / SKIP_NITPICK / SKIP_OUT_OF_SCOPE /
// SKIP_FALSE_POSITIVE) using the team's house rules in
// `prompts/cr-evaluation.md`, and posts an inline reply per comment.
// ACCEPT comments get a concrete suggestion; SKIP_* comments get a
// reasoned skip reply citing why.
//
// **OpenClaw never auto-applies changes.** Every reply is advisory — the
// engineer reviewing the PR decides whether to act on the suggestion or
// override OpenClaw's call.
//
// Idempotency: each reply we post is marked
// `<!-- openclaw:cr-eval:{commentId} -->`. Re-runs scan for that marker
// and skip comments we've already evaluated. To force a re-evaluation,
// delete the marker reply on GitHub.
//
// Usage:
//   node tools/openclaw/triage-cr.mjs <pr-number>
//   OPENCLAW_MODEL=kimi-k2.6:cloud node tools/openclaw/triage-cr.mjs 145
import { execFile } from "node:child_process"
import { promisify } from "node:util"

import { buildEvaluatorPrompt, parseEvaluatorResponse } from "./lib/cr-evaluator.mjs"
import { ensureModelAvailable, generate } from "./lib/ollama.mjs"
import { getInstallationToken, isAppAuthConfigured } from "./lib/github-app.mjs"
import { getOwnerRepo } from "./lib/comments.mjs"

const exec = promisify(execFile)
const MODEL = process.env.OPENCLAW_MODEL ?? "glm-5.1:cloud"
const GITHUB_API = "https://api.github.com"
const REPLY_MARKER_PREFIX = "<!-- openclaw:cr-eval:"

async function gh(args) {
  const { stdout } = await exec("gh", args, { maxBuffer: 50 * 1024 * 1024 })
  return stdout
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

/**
 * Fetch every CR review comment on the PR. Filters out comments we've
 * already evaluated (marker reply present) and comments authored by us
 * (we don't evaluate our own replies).
 */
async function listOpenCrComments(call, ownerRepo, prNumber) {
  // List all PR review comments, then walk replies to detect markers.
  const comments = await call("GET", `/repos/${ownerRepo}/pulls/${prNumber}/comments?per_page=100`)
  if (!Array.isArray(comments)) return []
  // Build a map of in_reply_to_id → bodies so we can detect "already
  // evaluated" markers without N+1 API calls.
  const repliesByParent = new Map()
  for (const c of comments) {
    if (typeof c.in_reply_to_id === "number") {
      const list = repliesByParent.get(c.in_reply_to_id) ?? []
      list.push(c.body ?? "")
      repliesByParent.set(c.in_reply_to_id, list)
    }
  }
  const isCrAuthor = (login) => typeof login === "string" && login.startsWith("coderabbitai")
  return comments.filter((c) => {
    if (!isCrAuthor(c.user?.login)) return false
    if (typeof c.in_reply_to_id === "number") return false // skip nested CR replies
    const replies = repliesByParent.get(c.id) ?? []
    return !replies.some((b) => b.includes(`${REPLY_MARKER_PREFIX}${c.id} -->`))
  })
}

async function fetchPrContext(prNumber) {
  const meta = JSON.parse(await gh(["pr", "view", String(prNumber), "--json", "title,body"]))
  const diff = await gh(["pr", "diff", String(prNumber)])
  return { title: meta.title, body: meta.body, diff }
}

function formatSkipReply(verdict) {
  const reasonLabel = {
    SKIP_NITPICK: "Nitpick, not a correctness issue",
    SKIP_OUT_OF_SCOPE: "Out of this PR's scope",
    SKIP_FALSE_POSITIVE: "False positive",
  }[verdict.classification]
  const reply = verdict.skipReply?.trim() || verdict.reason || "Recommending skip."
  return `${REPLY_MARKER_PREFIX}${verdict.commentId} -->
🦞 **OpenClaw recommends: skip — ${reasonLabel}**

${reply}

---
_Advisory only. The engineer reviewing this PR makes the final call._`
}

function formatAcceptReply(verdict) {
  const suggestion = verdict.suggestion?.trim() || verdict.reason
  return `${REPLY_MARKER_PREFIX}${verdict.commentId} -->
🦞 **OpenClaw recommends: accept**

${verdict.reason}

**Suggested fix:**

${suggestion}

---
_Advisory only. The engineer reviewing this PR makes the final call._`
}

async function postInlineReply(call, ownerRepo, prNumber, commentId, body) {
  await call("POST", `/repos/${ownerRepo}/pulls/${prNumber}/comments/${commentId}/replies`, {
    body,
  })
}

async function main() {
  const prArg = process.argv[2]
  if (!prArg || !/^\d+$/.test(prArg)) {
    console.error("Usage: node tools/openclaw/triage-cr.mjs <pr-number>")
    process.exit(2)
  }
  const prNumber = Number(prArg)

  try {
    await ensureModelAvailable(MODEL)
  } catch (error) {
    console.error(`OpenClaw pre-flight failed: ${error.message}`)
    process.exit(2)
  }

  // CR-eval requires App auth — we post as the bot, not the developer.
  const call = await buildAppCallable()
  if (!call) {
    console.error(
      "OpenClaw CR evaluator requires GitHub App credentials (OPENCLAW_APP_ID + OPENCLAW_PRIVATE_KEY_PATH + OPENCLAW_INSTALLATION_ID). Aborting so we don't post under your personal identity."
    )
    process.exit(2)
  }

  const ownerRepo = await getOwnerRepo()
  const comments = await listOpenCrComments(call, ownerRepo, prNumber)
  if (comments.length === 0) {
    console.log(`No fresh CR comments on PR #${prNumber} — nothing to evaluate.`)
    process.exit(0)
  }

  const prCtx = await fetchPrContext(prNumber)
  const prompt = await buildEvaluatorPrompt({
    prNumber,
    prTitle: prCtx.title,
    prBody: prCtx.body,
    prDiff: prCtx.diff,
    comments,
  })

  const response = await generate({ model: MODEL, prompt, temperature: 0.15 })
  const verdicts = parseEvaluatorResponse(response)
  if (!verdicts) {
    console.error("Model output did not parse as a verdict array; raw output below:\n")
    console.error(response)
    process.exit(2)
  }

  // Map for fast lookup; the model is supposed to preserve order but we
  // verify by id rather than position.
  const byId = new Map(verdicts.map((v) => [v.commentId, v]))

  let posted = 0
  let skipped = 0
  for (const comment of comments) {
    const verdict = byId.get(comment.id)
    if (!verdict) {
      console.warn(`No verdict returned for comment ${comment.id} — skipping.`)
      continue
    }
    const reply =
      verdict.classification === "ACCEPT" ? formatAcceptReply(verdict) : formatSkipReply(verdict)
    try {
      await postInlineReply(call, ownerRepo, prNumber, comment.id, reply)
      posted += 1
      console.log(`Posted ${verdict.classification} reply on comment ${comment.id}`)
    } catch (error) {
      skipped += 1
      console.warn(`Failed to post reply on comment ${comment.id}: ${error.message}`)
    }
  }

  console.log(`CR triage complete on PR #${prNumber}: ${posted} replies posted, ${skipped} failed.`)
}

main().catch((error) => {
  console.error("OpenClaw CR triage failed:", error)
  process.exit(2)
})
