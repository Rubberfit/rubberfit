#!/usr/bin/env node
/* eslint-env node */
// OpenClaw v7 — @-mention reply.
//
// A user mentioned the bot in an issue or PR top-level comment.
// We:
//   1. Drop a 👀 reaction on the source comment so the user knows we saw it
//   2. Fetch thread context + retrieve related code chunks
//   3. Call the model to compose a focused answer (or abstain)
//   4. Post a fresh top-level comment carrying the mention-reply marker
//
// Usage:
//   node tools/openclaw/triage-mention.mjs <issue-or-pr-number> <comment-id> <surface>
//
// surface = "issue_comment" | "pr_comment"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

import {
  buildMentionPrompt,
  formatMentionReply,
  isKnownBotAuthor,
  parseMentionResponse,
  stripMentionFromBody,
} from "./lib/mention-detection.mjs"
import { ensureModelAvailable, generate } from "./lib/ollama.mjs"
import { loadIndex } from "./lib/indexer.mjs"
import { retrieveRelatedChunks } from "./lib/retrieval.mjs"
import { getInstallationToken, isAppAuthConfigured } from "./lib/github-app.mjs"
import { getOwnerRepo } from "./lib/comments.mjs"

const exec = promisify(execFile)
const MODEL = process.env.OPENCLAW_MODEL ?? "glm-5.1:cloud"
const GITHUB_API = "https://api.github.com"
const REPLY_MARKER_PREFIX = "<!-- openclaw:mention-reply:"

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
 * Drop a 👀 reaction on the source comment. Best-effort — failures
 * here shouldn't abort the run; the user just won't see the eyes.
 */
async function reactEyes(call, ownerRepo, commentId) {
  try {
    await call("POST", `/repos/${ownerRepo}/issues/comments/${commentId}/reactions`, {
      content: "eyes",
    })
  } catch (error) {
    console.warn(`Failed to drop 👀 reaction on comment ${commentId}: ${error.message}`)
  }
}

async function fetchSurfaceContext(surface, number) {
  const meta = JSON.parse(
    await gh([
      surface === "pr_comment" ? "pr" : "issue",
      "view",
      String(number),
      "--json",
      surface === "pr_comment" ? "title,body,author,headRefOid" : "title,body,author",
    ])
  )
  return {
    title: meta.title ?? "",
    body: meta.body ?? "",
    author: meta.author?.login ?? null,
  }
}

async function fetchPrDiff(number) {
  try {
    return await gh(["pr", "diff", String(number)])
  } catch {
    return ""
  }
}

async function fetchRecentComments(call, ownerRepo, number, ceilingId) {
  // Issue comments REST endpoint covers BOTH issue + PR top-level
  // comments. Returns oldest-first. We slice the most recent N
  // comments authored at or before the source mention so the model
  // sees the buildup, not unrelated later chatter.
  const items = await call(
    "GET",
    `/repos/${ownerRepo}/issues/${number}/comments?per_page=100&sort=created&direction=asc`
  )
  if (!Array.isArray(items)) return []
  return items
    .filter((c) => c.id <= ceilingId)
    .map((c) => ({ id: c.id, author: c.user?.login ?? "?", body: c.body ?? "" }))
}

async function findExistingReply(call, ownerRepo, number, sourceCommentId) {
  const items = await call(
    "GET",
    `/repos/${ownerRepo}/issues/${number}/comments?per_page=100`
  )
  if (!Array.isArray(items)) return null
  const marker = `${REPLY_MARKER_PREFIX}${sourceCommentId} -->`
  return items.find((c) => typeof c.body === "string" && c.body.includes(marker))?.id ?? null
}

async function main() {
  const numberArg = process.argv[2]
  const commentArg = process.argv[3]
  const surface = process.argv[4]
  if (
    !numberArg ||
    !/^\d+$/.test(numberArg) ||
    !commentArg ||
    !/^\d+$/.test(commentArg) ||
    (surface !== "issue_comment" && surface !== "pr_comment")
  ) {
    console.error(
      "Usage: node tools/openclaw/triage-mention.mjs <number> <comment-id> <issue_comment|pr_comment>"
    )
    process.exit(2)
  }
  const number = Number(numberArg)
  const sourceCommentId = Number(commentArg)

  console.log(`[mention] #${number} comment ${sourceCommentId}: pre-flight model check...`)
  try {
    await ensureModelAvailable(MODEL)
  } catch (error) {
    console.error(`OpenClaw pre-flight failed: ${error.message}`)
    process.exit(2)
  }

  const call = await buildAppCallable()
  if (!call) {
    console.error(
      "OpenClaw mention reply requires GitHub App credentials (OPENCLAW_APP_ID + OPENCLAW_PRIVATE_KEY_PATH + OPENCLAW_INSTALLATION_ID)."
    )
    process.exit(2)
  }
  const ownerRepo = await getOwnerRepo()

  // Fetch the source comment so we have author + body for filtering + prompt.
  console.log(`[mention] #${number}: fetching source comment ${sourceCommentId}...`)
  const sourceComment = await call(
    "GET",
    `/repos/${ownerRepo}/issues/comments/${sourceCommentId}`
  )
  if (!sourceComment || typeof sourceComment.body !== "string") {
    console.error(`Source comment ${sourceCommentId} not found or empty.`)
    process.exit(2)
  }
  const askerLogin = sourceComment.user?.login ?? "anonymous"
  if (isKnownBotAuthor(askerLogin)) {
    console.log(`Mention from bot author ${askerLogin} — ignoring.`)
    process.exit(0)
  }

  // Idempotency: if we already replied to this exact source comment,
  // skip. The poll-state's handledMentions normally catches this, but
  // the marker is the source of truth.
  const existing = await findExistingReply(call, ownerRepo, number, sourceCommentId)
  if (existing != null) {
    console.log(`Already replied (comment ${existing}) — skipping.`)
    process.exit(0)
  }

  // Fire the 👀 reaction immediately so the user knows we saw the mention
  // before the model call lands.
  await reactEyes(call, ownerRepo, sourceCommentId)

  console.log(`[mention] #${number}: fetching surface + thread context...`)
  const ctx = await fetchSurfaceContext(surface, number)
  const recent = await fetchRecentComments(call, ownerRepo, number, sourceCommentId)
  const prDiff = surface === "pr_comment" ? await fetchPrDiff(number) : ""

  const question = stripMentionFromBody(sourceComment.body)

  console.log(`[mention] #${number}: retrieving related code chunks...`)
  const index = await loadIndex(process.cwd())
  let retrievedChunks = []
  if (index) {
    try {
      const ranked = await retrieveRelatedChunks({
        index,
        ciLog: "",
        // Use the question + nearby thread so retrieval has more
        // signal than just a 20-word @-mention.
        prDiff: `${ctx.title}\n\n${question}\n\n${recent
          .slice(-3)
          .map((c) => c.body)
          .join("\n")}`,
        k: 6,
      })
      retrievedChunks = ranked.map(({ chunk, score }) => ({
        path: chunk.path,
        lineStart: chunk.lineStart,
        lineEnd: chunk.lineEnd,
        content: chunk.content,
        score,
      }))
    } catch (error) {
      console.warn(`Retrieval failed (continuing without it): ${error.message}`)
    }
  }

  console.log(`[mention] #${number}: building prompt + calling ${MODEL}...`)
  const prompt = await buildMentionPrompt({
    surface,
    number,
    title: ctx.title,
    body: ctx.body,
    askerLogin,
    question,
    recentComments: recent.slice(-10),
    prDiff,
    retrievedChunks,
  })
  const t0 = Date.now()
  const response = await generate({ model: MODEL, prompt, temperature: 0.2 })
  console.log(
    `[mention] #${number}: model returned in ${Math.round((Date.now() - t0) / 1000)}s`
  )

  const verdict = parseMentionResponse(response)
  if (!verdict) {
    console.error("Model output did not parse as a valid mention reply; raw output below:\n")
    console.error(response)
    process.exit(2)
  }

  const body = formatMentionReply({
    verdict,
    askerLogin,
    sourceCommentId,
    marker: REPLY_MARKER_PREFIX,
  })
  const created = await call("POST", `/repos/${ownerRepo}/issues/${number}/comments`, { body })
  console.log(
    `Mention reply posted on #${number} as bot (replyId=${created?.id ?? "?"}, abstain=${verdict.abstain}, confidence=${verdict.confidence}/5)`
  )
}

main().catch((error) => {
  console.error("OpenClaw mention reply failed:", error)
  process.exit(2)
})
