#!/usr/bin/env node
// Build (or refresh) the OpenClaw codebase index. Walks the repo from
// process.cwd(), chunks every indexable source file, embeds each chunk
// via Ollama's nomic-embed-text, and persists the result to
// `.openclaw/index.json` for retrieval by `triage-ci.mjs`.
//
// Re-run is incremental: chunks whose file fingerprint (path + mtime)
// matches the previous build are reused without re-embedding. Embedding
// calls only fire for new or modified files.
//
// Usage:
//   node tools/openclaw/index-repo.mjs              # build/refresh in $PWD
//   node tools/openclaw/index-repo.mjs --root /path # explicit root
//
// The index file is gitignored — local to each developer / runner.
import { resolve } from "node:path"

import { buildIndex } from "./lib/indexer.mjs"
import { ensureModelAvailable } from "./lib/ollama.mjs"

function parseArgs(argv) {
  const out = { root: process.cwd() }
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--root" && argv[i + 1]) {
      out.root = resolve(argv[i + 1])
      i++
    } else if (arg === "-h" || arg === "--help") {
      out.help = true
    }
  }
  return out
}

function logProgress(event) {
  switch (event.stage) {
    case "scan":
      // Quiet — only print every 50th file or so to keep terminals readable.
      if (Math.random() < 0.02) {
        process.stderr.write(`  scanning… ${event.path}\n`)
      }
      break
    case "embed":
      process.stderr.write(`  embedding ${event.count} new chunks via nomic-embed-text\n`)
      break
    case "done":
      process.stderr.write(`  done: ${event.total} total chunks, ${event.fresh} freshly embedded\n`)
      break
  }
}

async function main() {
  const args = parseArgs(process.argv)
  if (args.help) {
    console.log("Usage: node tools/openclaw/index-repo.mjs [--root <path>]")
    process.exit(0)
  }

  process.stderr.write(`Indexing ${args.root}\n`)
  try {
    await ensureModelAvailable("nomic-embed-text")
  } catch (error) {
    console.error(`OpenClaw indexer pre-flight failed: ${error.message}`)
    process.exit(2)
  }

  const start = Date.now()
  const index = await buildIndex(args.root, { onProgress: logProgress })
  const seconds = ((Date.now() - start) / 1000).toFixed(1)
  process.stderr.write(`Index written: ${index.chunks.length} chunks in ${seconds}s\n`)
}

main().catch((error) => {
  console.error("OpenClaw indexer failed:", error)
  process.exit(2)
})
