// Idempotent PR comment helpers. Posts as `@openclaw[bot]` when GitHub App
// auth is configured (see `lib/github-app.mjs`); otherwise falls back to
// the developer's personal identity via the `gh` CLI.
//
// Idempotency: every triage comment carries the `<!-- openclaw:ci-triage -->`
// marker. Re-runs find the marker comment and edit it in place, so the bot
// never spams a PR.
import { execFile } from "node:child_process"
import { promisify } from "node:util"

import { getInstallationToken, isAppAuthConfigured } from "./github-app.mjs"

const exec = promisify(execFile)

/** HTML comment marker that identifies an OpenClaw triage comment. */
export const TRIAGE_MARKER = "<!-- openclaw:ci-triage -->"

const GITHUB_API = "https://api.github.com"

async function gh(args) {
  const { stdout } = await exec("gh", args, { maxBuffer: 50 * 1024 * 1024 })
  return stdout
}

/**
 * Resolve `owner/name` for the current repo via `gh repo view`. Used in
 * both auth modes since `gh repo view` works with any auth and the result
 * is just the slug (no API write).
 */
export async function getOwnerRepo() {
  const out = await gh(["repo", "view", "--json", "owner,name"])
  const json = JSON.parse(out)
  return `${json.owner.login}/${json.name}`
}

/**
 * Build a fetch-based GitHub API client. Uses the installation token when
 * App auth is configured (so writes show up as `@openclaw[bot]`); returns
 * null otherwise to signal "fall back to gh CLI mode."
 */
async function buildAppClient() {
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
      throw new Error(`GitHub ${method} ${path} failed (HTTP ${res.status}): ${text.slice(0, 300)}`)
    }
    if (res.status === 204) return null
    return res.json()
  }
}

async function findCommentViaApp(client, ownerRepo, prNumber) {
  // Paginate until we find the marker. PR comments live on the "issue"
  // resource (PRs are issues with patches attached), so the comments
  // endpoint is `/repos/.../issues/N/comments`.
  let page = 1
  while (true) {
    const items = await client(
      "GET",
      `/repos/${ownerRepo}/issues/${prNumber}/comments?per_page=100&page=${page}`
    )
    if (!Array.isArray(items) || items.length === 0) return null
    const hit = items.find((c) => typeof c.body === "string" && c.body.includes(TRIAGE_MARKER))
    if (hit) return hit.id
    if (items.length < 100) return null
    page += 1
  }
}

async function findCommentViaGh(ownerRepo, prNumber) {
  const out = await gh([
    "api",
    `repos/${ownerRepo}/issues/${prNumber}/comments`,
    "--paginate",
    "--jq",
    `[.[] | select(.body | contains("${TRIAGE_MARKER}")) | .id] | first // empty`,
  ])
  const trimmed = out.trim()
  return trimmed === "" ? null : Number(trimmed)
}

/**
 * Find an existing OpenClaw triage comment on the given PR. Returns the
 * comment id when found, null otherwise.
 */
export async function findTriageComment(prNumber) {
  const ownerRepo = await getOwnerRepo()
  const client = await buildAppClient()
  if (client) return findCommentViaApp(client, ownerRepo, prNumber)
  return findCommentViaGh(ownerRepo, prNumber)
}

/**
 * Post or update the triage comment for `prNumber`. The `mode` field of
 * the return value tells the caller which path was taken so it can log
 * accurately.
 *
 * Returns:
 *   { mode: "created" | "updated", commentId: number | null, identity: "bot" | "user" }
 */
export async function postOrUpdateTriage(prNumber, body) {
  const tagged = `${TRIAGE_MARKER}\n${body}`
  const ownerRepo = await getOwnerRepo()
  const client = await buildAppClient()

  if (client) {
    const existingId = await findCommentViaApp(client, ownerRepo, prNumber)
    if (existingId != null) {
      await client("PATCH", `/repos/${ownerRepo}/issues/comments/${existingId}`, { body: tagged })
      return { mode: "updated", commentId: existingId, identity: "bot" }
    }
    const created = await client("POST", `/repos/${ownerRepo}/issues/${prNumber}/comments`, {
      body: tagged,
    })
    return { mode: "created", commentId: created?.id ?? null, identity: "bot" }
  }

  // Fallback: post via `gh` CLI as the authenticated user.
  const existingId = await findCommentViaGh(ownerRepo, prNumber)
  if (existingId != null) {
    await gh([
      "api",
      "-X",
      "PATCH",
      `repos/${ownerRepo}/issues/comments/${existingId}`,
      "-f",
      `body=${tagged}`,
    ])
    return { mode: "updated", commentId: existingId, identity: "user" }
  }
  await gh(["pr", "comment", String(prNumber), "--body", tagged])
  return { mode: "created", commentId: null, identity: "user" }
}
