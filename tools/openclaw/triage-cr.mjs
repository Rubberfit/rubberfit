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
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import {
  buildEvaluatorPrompt,
  extractFileContext,
  parseEvaluatorResponse,
} from "./lib/cr-evaluator.mjs"
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
  const meta = JSON.parse(await gh(["pr", "view", String(prNumber), "--json", "title,body,author"]))
  const diff = await gh(["pr", "diff", String(prNumber)])
  return {
    title: meta.title,
    body: meta.body,
    diff,
    author: meta.author?.login ?? null,
  }
}

/**
 * Read ±N lines around the CR comment's affected line so the model can
 * write a precise verdict instead of a generic "consider X" hand-wave.
 * Falls back to null when the file isn't readable from the working
 * directory (rare — we run inside the repo checkout).
 */
async function readFileContextForComment(comment) {
  if (!comment.path) return null
  try {
    const content = await readFile(resolve(process.cwd(), comment.path), "utf8")
    const line = comment.line ?? comment.original_line
    return extractFileContext(content, line)
  } catch {
    return null
  }
}

function mention(prAuthor) {
  // PR author may be null (e.g., user deleted), or it may be the bot
  // itself if OpenClaw ever opens its own PRs — don't @-mention either.
  if (!prAuthor) return ""
  if (prAuthor.toLowerCase().includes("[bot]")) return ""
  return `@${prAuthor} `
}

/**
 * Severity tag prepended to each reply, mirroring Greptile's
 * `[P0]` / `[P1]` shape — at-a-glance indicator before the headline.
 */
const TAG_BY_CLASS = {
  ACCEPT: "ACCEPT",
  SKIP_NITPICK: "NITPICK — safe to skip",
  SKIP_OUT_OF_SCOPE: "OUT OF SCOPE",
  SKIP_FALSE_POSITIVE: "FALSE POSITIVE",
}

/**
 * Render a verdict as the inline reply body. Greptile-style: bracketed
 * tag, headline as the first line, technical body underneath, no
 * trailing advisory disclaimer. ACCEPTs get an `@author` mention so
 * the PR owner is pinged; SKIPs stay quiet (the reviewer who sees the
 * thread will pick up the recommendation).
 */
function formatVerdictReply(verdict, prAuthor) {
  const tag = TAG_BY_CLASS[verdict.classification] ?? verdict.classification
  const headline = verdict.headline?.trim() || verdict.reason?.trim() || ""
  const lines = [`${REPLY_MARKER_PREFIX}${verdict.commentId} -->`]
  // Tag + headline on the first content line (the line CR / GitHub
  // renders in the "expanded" preview), so reviewers can skim a thread
  // and triage all OpenClaw verdicts at a glance.
  lines.push(`🦞 [${tag}] ${headline}`.trim())
  lines.push("")
  if (verdict.classification === "ACCEPT" && prAuthor && mention(prAuthor)) {
    lines.push(`${mention(prAuthor)}— flagging since this read holds up.`)
    lines.push("")
  }
  // Body — preserves the model's technical paragraphs verbatim.
  const body = verdict.body?.trim() || verdict.skipReply?.trim() || verdict.reason?.trim() || ""
  if (body) lines.push(body)
  if (verdict.classification === "ACCEPT" && verdict.location?.trim()) {
    lines.push("")
    lines.push(`**Where:** \`${verdict.location.trim()}\``)
  }
  return lines.join("\n")
}

async function postInlineReply(call, ownerRepo, prNumber, commentId, body) {
  await call("POST", `/repos/${ownerRepo}/pulls/${prNumber}/comments/${commentId}/replies`, {
    body,
  })
}

/**
 * Fetch every review thread on the PR and return a map keyed by the
 * REST `databaseId` of each comment to `{ threadId, isResolved }`. We
 * use this to resolve threads where OpenClaw's verdict is a SKIP_*
 * classification — the bot already replied with the rationale, so the
 * nitpick / out-of-scope / false-positive thread no longer needs a
 * human's attention.
 */
async function fetchReviewThreadMap(call, ownerRepo, prNumber) {
  const [owner, repo] = ownerRepo.split("/")
  const query = `
    query($owner: String!, $repo: String!, $num: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $num) {
          reviewThreads(first: 100) {
            nodes {
              id
              isResolved
              comments(first: 20) { nodes { databaseId } }
            }
          }
        }
      }
    }
  `
  const res = await call("POST", "/graphql", {
    query,
    variables: { owner, repo, num: prNumber },
  })
  if (res?.errors?.length) {
    throw new Error(`GraphQL errors: ${JSON.stringify(res.errors).slice(0, 300)}`)
  }
  const threads = res?.data?.repository?.pullRequest?.reviewThreads?.nodes ?? []
  const map = new Map()
  for (const t of threads) {
    for (const c of t.comments?.nodes ?? []) {
      if (typeof c.databaseId === "number") {
        map.set(c.databaseId, { threadId: t.id, isResolved: !!t.isResolved })
      }
    }
  }
  return map
}

async function resolveReviewThread(call, threadId) {
  const mutation = `
    mutation($id: ID!) {
      resolveReviewThread(input: { threadId: $id }) {
        thread { id isResolved }
      }
    }
  `
  const res = await call("POST", "/graphql", { query: mutation, variables: { id: threadId } })
  if (res?.errors?.length) {
    throw new Error(`GraphQL errors: ${JSON.stringify(res.errors).slice(0, 300)}`)
  }
}

async function main() {
  const prArg = process.argv[2]
  if (!prArg || !/^\d+$/.test(prArg)) {
    console.error("Usage: node tools/openclaw/triage-cr.mjs <pr-number>")
    process.exit(2)
  }
  const prNumber = Number(prArg)

  console.log(`[cr-triage] PR #${prNumber}: pre-flight model check...`)
  try {
    await ensureModelAvailable(MODEL)
  } catch (error) {
    console.error(`OpenClaw pre-flight failed: ${error.message}`)
    process.exit(2)
  }

  // CR-eval requires App auth — we post as the bot, not the developer.
  console.log(`[cr-triage] PR #${prNumber}: building App auth...`)
  const call = await buildAppCallable()
  if (!call) {
    console.error(
      "OpenClaw CR evaluator requires GitHub App credentials (OPENCLAW_APP_ID + OPENCLAW_PRIVATE_KEY_PATH + OPENCLAW_INSTALLATION_ID). Aborting so we don't post under your personal identity."
    )
    process.exit(2)
  }

  const ownerRepo = await getOwnerRepo()
  console.log(`[cr-triage] PR #${prNumber}: fetching CR comments...`)
  const comments = await listOpenCrComments(call, ownerRepo, prNumber)
  if (comments.length === 0) {
    console.log(`No fresh CR comments on PR #${prNumber} — nothing to evaluate.`)
    process.exit(0)
  }
  console.log(`[cr-triage] PR #${prNumber}: ${comments.length} CR comment(s) to evaluate.`)

  console.log(`[cr-triage] PR #${prNumber}: fetching PR context (title/body/diff)...`)
  const prCtx = await fetchPrContext(prNumber)

  // Pre-fetch the review-thread map so SKIP_* verdicts can mark their
  // thread resolved once the reply lands. Failure here is non-fatal —
  // we log and proceed without auto-resolve.
  let threadMap = new Map()
  try {
    threadMap = await fetchReviewThreadMap(call, ownerRepo, prNumber)
  } catch (error) {
    console.warn(`Could not fetch review threads (auto-resolve disabled): ${error.message}`)
  }

  // Decorate each comment with ±20 lines of file context so the
  // evaluator prompt can produce surgical verdicts instead of generic
  // ones. Comments where we can't read the file (rare) simply skip the
  // context and rely on PR diff alone.
  console.log(`[cr-triage] PR #${prNumber}: reading file context for ${comments.length} comments...`)
  for (const comment of comments) {
    const fileContext = await readFileContextForComment(comment)
    if (fileContext) comment.fileContext = fileContext
  }

  // One comment per LLM call. Smaller prompts (~5-8k chars) return in
  // 30-90 seconds on glm-5.1:cloud, and operators see each verdict
  // posted to GitHub as soon as it's ready instead of waiting for a
  // whole batch to finish. Trade-off: more API calls to the LLM
  // provider (N instead of N/3), but the daemon is sequential anyway
  // so wall-clock is similar and reliability is much better — a
  // failure on one comment doesn't take down the others.
  //
  // PR diff is dropped — each comment carries ±20 lines of file
  // context from `readFileContextForComment` above, which is the
  // surgical context the verdict actually needs.
  const BATCH_SIZE = 1
  const batches = []
  for (let i = 0; i < comments.length; i += BATCH_SIZE) {
    batches.push(comments.slice(i, i + BATCH_SIZE))
  }

  // Post replies per-batch instead of accumulating all verdicts and
  // bulk-posting at the end. Operators see OpenClaw thinking through
  // the comments in real time on GitHub — no 5-minute silence followed
  // by a flood of replies.
  let posted = 0
  let skipped = 0
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    console.log(
      `[cr-triage] PR #${prNumber}: building evaluator prompt for batch ${i + 1}/${batches.length} (${batch.length} comments)...`
    )
    const prompt = await buildEvaluatorPrompt({
      prNumber,
      prTitle: prCtx.title,
      prBody: prCtx.body,
      prDiff: "", // diff dropped — comment.fileContext already provides surgical context
      comments: batch,
    })

    console.log(
      `[cr-triage] PR #${prNumber}: calling ${MODEL} with ${prompt.length}-char prompt (batch ${i + 1}/${batches.length})...`
    )
    const t0 = Date.now()
    const response = await generate({ model: MODEL, prompt, temperature: 0.15 })
    console.log(
      `[cr-triage] PR #${prNumber}: batch ${i + 1}/${batches.length} returned in ${Math.round((Date.now() - t0) / 1000)}s`
    )
    const batchVerdicts = parseEvaluatorResponse(response)
    if (!batchVerdicts) {
      console.error(
        `Model output did not parse as a verdict array for batch ${i + 1}; raw output below:\n`
      )
      console.error(response)
      process.exit(2)
    }

    // Stream replies for this batch immediately. Map by commentId so a
    // model that returns out of order still posts to the right thread.
    const byId = new Map(batchVerdicts.map((v) => [v.commentId, v]))
    for (const comment of batch) {
      const verdict = byId.get(comment.id)
      if (!verdict) {
        console.warn(`No verdict returned for comment ${comment.id} — skipping.`)
        continue
      }
      const reply = formatVerdictReply(verdict, prCtx.author)
      try {
        await postInlineReply(call, ownerRepo, prNumber, comment.id, reply)
        posted += 1
        console.log(`Posted ${verdict.classification} reply on comment ${comment.id}`)

        // Resolve the review thread on SKIP_* verdicts. ACCEPT
        // threads stay open so the human reviewer can act on them.
        // We only call resolve when the thread isn't already resolved.
        if (typeof verdict.classification === "string" && verdict.classification.startsWith("SKIP_")) {
          const thread = threadMap.get(comment.id)
          if (thread && !thread.isResolved) {
            try {
              await resolveReviewThread(call, thread.threadId)
              console.log(`Resolved thread on comment ${comment.id} (${verdict.classification})`)
            } catch (error) {
              console.warn(`Failed to resolve thread on comment ${comment.id}: ${error.message}`)
            }
          }
        }
      } catch (error) {
        skipped += 1
        console.warn(`Failed to post reply on comment ${comment.id}: ${error.message}`)
      }
    }
  }

  console.log(`CR triage complete on PR #${prNumber}: ${posted} replies posted, ${skipped} failed.`)
}

main().catch((error) => {
  console.error("OpenClaw CR triage failed:", error)
  process.exit(2)
})
