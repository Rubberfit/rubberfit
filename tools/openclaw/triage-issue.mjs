#!/usr/bin/env node
// OpenClaw v5 — detailed issue triage with codebase context.
//
// When a new issue lands, do a Greptile-style first read: classify
// severity + estimate, name the relevant files, sketch the fix shape,
// and flag any prior art / standard pattern the engineer should look
// at before coding. Replaces the earlier 1-line `pts-N, prio-pN` triage
// with a richer, codebase-grounded reply.
//
// Idempotency: the comment we post carries
// `<!-- openclaw:issue-triage -->`. Re-runs find it and edit in place
// — no spam.
//
// Usage:
//   node tools/openclaw/triage-issue.mjs <issue-number>
//   OPENCLAW_MODEL=kimi-k2.6:cloud node tools/openclaw/triage-issue.mjs 128
//
// Auth: posts as @openclaw[bot] when App auth is configured. Falls
// back to the developer's gh CLI identity when it isn't (rare on the
// devops box, useful for ad-hoc local runs).
import { execFile } from "node:child_process"
import { promisify } from "node:util"

import {
  buildIssueTriagePrompt,
  formatIssueTriageComment,
  parseIssueTriageResponse,
} from "./lib/issue-triage.mjs"
import { ensureModelAvailable, generate } from "./lib/ollama.mjs"
import { loadIndex } from "./lib/indexer.mjs"
import { retrieveRelatedChunks } from "./lib/retrieval.mjs"
import { getInstallationToken, isAppAuthConfigured } from "./lib/github-app.mjs"
import { getOwnerRepo } from "./lib/comments.mjs"
import {
  addOrFindProjectItem,
  applyProjectVerdict,
  getProjectFieldMap,
} from "./lib/projects.mjs"

// Map verdict.estimate → Story Points option name on the board.
// Project field is single-select with options 1/2/3/5/8/13. We don't
// auto-assign 13 — that's a "true epic" the operator should size by hand.
const ESTIMATE_TO_STORY_POINTS = {
  trivial: "1",
  S: "2",
  M: "3",
  L: "5",
  XL: "8",
}

const exec = promisify(execFile)
const MODEL = process.env.OPENCLAW_MODEL ?? "glm-5.1:cloud"
const GITHUB_API = "https://api.github.com"
const TRIAGE_MARKER = "<!-- openclaw:issue-triage -->"

async function gh(args) {
  const { stdout } = await exec("gh", args, { maxBuffer: 50 * 1024 * 1024 })
  return stdout
}

async function fetchIssue(issueNumber) {
  const out = await gh([
    "issue",
    "view",
    String(issueNumber),
    "--json",
    "title,body,author,labels,createdAt,id",
  ])
  const meta = JSON.parse(out)
  return {
    title: meta.title,
    body: meta.body,
    author: meta.author?.login ?? null,
    labels: (meta.labels ?? []).map((l) => l.name),
    createdAt: meta.createdAt,
    nodeId: meta.id,
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

async function findExistingTriage(call, ownerRepo, issueNumber) {
  if (!call) return null
  let page = 1
  while (true) {
    const items = await call(
      "GET",
      `/repos/${ownerRepo}/issues/${issueNumber}/comments?per_page=100&page=${page}`
    )
    if (!Array.isArray(items) || items.length === 0) return null
    const hit = items.find((c) => typeof c.body === "string" && c.body.includes(TRIAGE_MARKER))
    if (hit) return hit.id
    if (items.length < 100) return null
    page += 1
  }
}

async function postOrUpdateTriage(prNumberOrIssue, body, callOpt, ownerRepoOpt) {
  const ownerRepo = ownerRepoOpt ?? (await getOwnerRepo())
  const call = callOpt ?? (await buildAppCallable())
  if (call) {
    const existing = await findExistingTriage(call, ownerRepo, prNumberOrIssue)
    if (existing != null) {
      await call("PATCH", `/repos/${ownerRepo}/issues/comments/${existing}`, { body })
      return { mode: "updated", commentId: existing, identity: "bot" }
    }
    const created = await call("POST", `/repos/${ownerRepo}/issues/${prNumberOrIssue}/comments`, {
      body,
    })
    return { mode: "created", commentId: created?.id ?? null, identity: "bot" }
  }
  // Fallback: gh CLI under the developer's identity. Only used for
  // local/manual runs against PRs the devops box doesn't see yet.
  const stdout = await gh([
    "api",
    `repos/${ownerRepo}/issues/${prNumberOrIssue}/comments`,
    "--paginate",
    "--jq",
    `[.[] | select(.body | contains("${TRIAGE_MARKER}")) | .id] | first // empty`,
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
  await gh(["issue", "comment", String(prNumberOrIssue), "--body", body])
  return { mode: "created", commentId: null, identity: "user" }
}

async function main() {
  const arg = process.argv[2]
  if (!arg || !/^\d+$/.test(arg)) {
    console.error("Usage: node tools/openclaw/triage-issue.mjs <issue-number>")
    process.exit(2)
  }
  const issueNumber = Number(arg)

  try {
    await ensureModelAvailable(MODEL)
  } catch (error) {
    console.error(`OpenClaw pre-flight failed: ${error.message}`)
    process.exit(2)
  }

  const issue = await fetchIssue(issueNumber)

  // v3 retrieval — find codebase chunks semantically related to the
  // issue body so the triage can name specific files instead of
  // generic suggestions.
  const index = await loadIndex(process.cwd())
  let retrievedChunks = []
  if (index) {
    try {
      const ranked = await retrieveRelatedChunks({
        index,
        ciLog: "",
        prDiff: `${issue.title}\n\n${issue.body ?? ""}`,
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

  const prompt = await buildIssueTriagePrompt({
    issueNumber,
    issueTitle: issue.title,
    issueBody: issue.body,
    issueAuthor: issue.author,
    labels: issue.labels,
    retrievedChunks,
  })

  const response = await generate({ model: MODEL, prompt, temperature: 0.2 })
  const verdict = parseIssueTriageResponse(response)
  if (!verdict) {
    console.error("Model output did not parse as a valid issue triage verdict; raw output below:\n")
    console.error(response)
    process.exit(2)
  }

  const body = formatIssueTriageComment({
    verdict,
    author: issue.author,
    marker: TRIAGE_MARKER,
  })

  // Build the App-authed callable once so we can reuse it across
  // comment post, label apply, and project field updates. Falls back
  // to gh-CLI inside postOrUpdateTriage for local manual runs.
  const ownerRepo = await getOwnerRepo()
  const call = await buildAppCallable()

  const result = await postOrUpdateTriage(issueNumber, body, call, ownerRepo)
  console.log(
    `Issue triage ${result.mode} on #${issueNumber} as ${result.identity} (severity=${verdict.severity}, estimate=${verdict.estimate})`
  )

  // Beyond the comment: apply labels + project board fields. Both
  // require the bot identity (App auth) — the gh-CLI fallback can't
  // safely set project fields under the developer's identity.
  if (call) {
    if (Array.isArray(verdict.labels) && verdict.labels.length > 0) {
      try {
        await call("POST", `/repos/${ownerRepo}/issues/${issueNumber}/labels`, {
          labels: verdict.labels,
        })
        console.log(`Applied labels: ${verdict.labels.join(", ")}`)
      } catch (error) {
        console.warn(`Label apply failed (continuing): ${error.message}`)
      }
    }

    const projectId = process.env.OPENCLAW_PROJECT_ID?.trim()
    if (projectId && issue.nodeId) {
      try {
        const graphql = async (query, variables) => {
          const res = await call("POST", "/graphql", { query, variables })
          if (res?.errors?.length) {
            throw new Error(`GraphQL errors: ${JSON.stringify(res.errors).slice(0, 300)}`)
          }
          return res?.data ?? null
        }
        const fieldMap = await getProjectFieldMap(graphql, projectId)
        const itemId = await addOrFindProjectItem(graphql, projectId, issue.nodeId)
        if (itemId) {
          await applyProjectVerdict(graphql, projectId, itemId, fieldMap, {
            Priority: verdict.severity,
            "Story Points": ESTIMATE_TO_STORY_POINTS[verdict.estimate],
          })
          console.log(
            `Set project fields on #${issueNumber}: Priority=${verdict.severity}, Story Points=${ESTIMATE_TO_STORY_POINTS[verdict.estimate] ?? "(unset)"}`
          )
        }
      } catch (error) {
        console.warn(`Project field update failed (continuing): ${error.message}`)
      }
    }
  }
}

main().catch((error) => {
  console.error("OpenClaw issue triage failed:", error)
  process.exit(2)
})
