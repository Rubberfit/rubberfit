#!/usr/bin/env node
// OpenClaw CI failure triage — Greptile-style PR diagnosis bot.
//
// Reads the latest failed CI workflow run on a PR, builds a context bundle
// (PR diff + CI log + affected file contents), asks GLM-5.1 (or the
// configured `OPENCLAW_MODEL`) to produce a structured diagnosis, and
// posts/updates a single sticky comment on the PR.
//
// Usage:
//   node tools/openclaw/triage-ci.mjs <pr-number>
//   OPENCLAW_MODEL=kimi-k2.6:cloud node tools/openclaw/triage-ci.mjs 145
//
// Exit codes:
//   0  diagnosis posted/updated, or skipped due to low confidence
//   1  no failed CI runs found on PR (nothing to triage)
//   2  unrecoverable error (Ollama unreachable, gh CLI missing, etc.)
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { buildTriagePrompt, extractMentionedFiles, parseConfidence } from "./lib/build-prompt.mjs"
import { ensureModelAvailable, generate } from "./lib/ollama.mjs"
import { postOrUpdateTriage } from "./lib/comments.mjs"
import { loadIndex } from "./lib/indexer.mjs"
import { retrieveRelatedChunks } from "./lib/retrieval.mjs"

const exec = promisify(execFile)
const MODEL = process.env.OPENCLAW_MODEL ?? "glm-5.1:cloud"

async function gh(args) {
  const { stdout } = await exec("gh", args, { maxBuffer: 50 * 1024 * 1024 })
  return stdout
}

async function getPrMeta(prNumber) {
  const out = await gh([
    "pr",
    "view",
    String(prNumber),
    "--json",
    "title,body,headRefName,statusCheckRollup",
  ])
  return JSON.parse(out)
}

/**
 * Find the most recently completed run for the PR's head ref that has at
 * least one failed check. Returns the GitHub Actions run id, or null when
 * everything is green.
 */
async function findFailedRunId(meta) {
  const failures = (meta.statusCheckRollup ?? []).filter((c) => c.conclusion === "FAILURE")
  if (failures.length === 0) return null
  // detailsUrl looks like https://github.com/owner/repo/actions/runs/<id>/job/<job>
  const match = failures[0].detailsUrl?.match(/\/runs\/(\d+)/)
  return match ? match[1] : null
}

async function readRunLog(runId) {
  // --log-failed strips most of the noise; further trimmed by the prompt
  // builder. If the run finished too long ago the logs may have rotated —
  // tolerate that by returning a placeholder so the model knows.
  try {
    return await gh(["run", "view", runId, "--log-failed"])
  } catch (error) {
    return `(failed to fetch logs for run ${runId}: ${error.message})`
  }
}

async function readPrDiff(prNumber) {
  return gh(["pr", "diff", String(prNumber)])
}

async function readFileSafe(path) {
  try {
    return await readFile(resolve(process.cwd(), path), "utf8")
  } catch {
    return null
  }
}

async function main() {
  const prArg = process.argv[2]
  if (!prArg || !/^\d+$/.test(prArg)) {
    console.error("Usage: node tools/openclaw/triage-ci.mjs <pr-number>")
    process.exit(2)
  }
  const prNumber = Number(prArg)

  // Pre-flight: model has to be reachable. Catching this early gives a
  // clearer error than the generic fetch failure inside `generate`.
  try {
    await ensureModelAvailable(MODEL)
  } catch (error) {
    console.error(`OpenClaw pre-flight failed: ${error.message}`)
    process.exit(2)
  }

  const meta = await getPrMeta(prNumber)
  const runId = await findFailedRunId(meta)
  if (!runId) {
    console.log(`No failed CI runs on PR #${prNumber} — nothing to triage.`)
    process.exit(1)
  }

  const [ciLog, prDiff] = await Promise.all([readRunLog(runId), readPrDiff(prNumber)])

  // Greptile-like context: pull the contents of files the failure log
  // names so the model can reason about the fix in context. Capped to a
  // handful of files to stay inside the prompt budget.
  const mentioned = extractMentionedFiles(ciLog).slice(0, 6)
  const fileContexts = []
  for (const path of mentioned) {
    const content = await readFileSafe(path)
    if (content != null) fileContexts.push({ path, content })
  }

  // v3: layer on semantic-similarity retrieval from the codebase index.
  // Falls back to no-op when the index hasn't been built — the v2 file-
  // context heuristic alone still produces useful diagnoses.
  const index = await loadIndex(process.cwd())
  let relatedChunks = []
  if (index) {
    const excludePaths = new Set(fileContexts.map((f) => f.path))
    try {
      const ranked = await retrieveRelatedChunks({
        index,
        ciLog,
        prDiff,
        excludePaths,
        k: 5,
      })
      relatedChunks = ranked.map(({ chunk, score }) => ({
        path: chunk.path,
        lineStart: chunk.lineStart,
        lineEnd: chunk.lineEnd,
        content: chunk.content,
        score,
      }))
    } catch (error) {
      console.warn(`Codebase retrieval failed (continuing without it): ${error.message}`)
    }
  }

  const prompt = await buildTriagePrompt({
    prNumber,
    prTitle: meta.title,
    prBody: meta.body,
    prDiff,
    ciLog,
    fileContexts,
    relatedChunks,
  })

  const response = await generate({ model: MODEL, prompt })
  const confidence = parseConfidence(response)

  if (confidence === "low" || confidence == null) {
    console.log(
      `Skipping post — confidence=${confidence ?? "unparsed"} (model output below)\n${response}`
    )
    process.exit(0)
  }

  const footer = `\n\n---\n_🦞 Auto-triage by **OpenClaw** · model \`${MODEL}\` · run \`${runId}\` · confidence \`${confidence}\`_`
  const result = await postOrUpdateTriage(prNumber, response + footer)
  console.log(
    `Triage ${result.mode} on PR #${prNumber} as ${result.identity} (run ${runId}, confidence ${confidence})`
  )
  if (result.identity === "user") {
    console.log(
      "Tip: set OPENCLAW_APP_ID + OPENCLAW_PRIVATE_KEY_PATH + OPENCLAW_INSTALLATION_ID to post as @openclaw[bot] instead of your personal account."
    )
  }
}

main().catch((error) => {
  console.error("OpenClaw triage failed:", error)
  process.exit(2)
})
