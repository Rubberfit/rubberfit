// Idempotent PR comment helpers. Uses gh API directly (over `gh pr comment`)
// so we can edit an existing marker comment instead of spamming a new one
// every time the triage script runs.
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const exec = promisify(execFile)

/** HTML comment marker that identifies an OpenClaw triage comment. */
export const TRIAGE_MARKER = "<!-- openclaw:ci-triage -->"

async function gh(args, input) {
  const { stdout } = await exec("gh", args, {
    maxBuffer: 50 * 1024 * 1024,
    input,
  })
  return stdout
}

/**
 * Resolve `owner/name` for the current repo via `gh repo view`.
 */
export async function getOwnerRepo() {
  const out = await gh(["repo", "view", "--json", "owner,name"])
  const json = JSON.parse(out)
  return `${json.owner.login}/${json.name}`
}

/**
 * Find an existing OpenClaw triage comment on the given PR. Returns the
 * comment id when found, null otherwise. The marker comment is rendered
 * invisibly by GitHub but reliably identifies our previous post.
 */
export async function findTriageComment(prNumber) {
  const ownerRepo = await getOwnerRepo()
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
 * Post a new triage comment, or edit the existing one if one is already
 * attached to this PR. The marker line is prepended so future runs can
 * find it.
 */
export async function postOrUpdateTriage(prNumber, body) {
  const tagged = `${TRIAGE_MARKER}\n${body}`
  const existingId = await findTriageComment(prNumber)
  const ownerRepo = await getOwnerRepo()
  if (existingId != null) {
    await gh([
      "api",
      "-X",
      "PATCH",
      `repos/${ownerRepo}/issues/comments/${existingId}`,
      "-f",
      `body=${tagged}`,
    ])
    return { mode: "updated", commentId: existingId }
  }
  await gh(["pr", "comment", String(prNumber), "--body", tagged])
  return { mode: "created", commentId: null }
}
