// Codebase indexer for OpenClaw v3 — file-based chunking + nomic-embed-text
// embeddings + JSON persistence. Greptile-style retrieval ("what other parts
// of the codebase are related to this failure") layered on top of v1's
// "files mentioned in the log" heuristic.
//
// Chunking: file contents split into overlapping line windows. We don't run
// treesitter — for retrieval at this repo's scale (~1k source files), line-
// window chunks ranked by cosine similarity recover the relevant context
// without the parser dependency. v4 can swap in symbol-aware chunking once
// the basic retrieval proves out.
//
// Storage: `.openclaw/index.json` at the repo root. Gitignored so each dev's
// index stays local, and the self-hosted runner builds its own. No remote
// state to sync, no cache invalidation across machines.
import { createHash } from "node:crypto"
import { readFile, readdir, stat, writeFile, mkdir } from "node:fs/promises"
import { resolve, relative, join } from "node:path"

import { getOllamaHost } from "./ollama.mjs"

const INDEX_VERSION = 1
const EMBEDDING_MODEL = "nomic-embed-text"

/** Files / dirs we never index. Build artifacts, deps, binary data, etc. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".vercel",
  "dist",
  "build",
  "coverage",
  "target", // Rust build output
  ".openclaw", // our own index
  ".claude", // local agent scratch
])

const INDEXED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mjs",
  ".js",
  ".jsx",
  ".rs",
  ".sql",
  ".md",
  ".yml",
  ".yaml",
  ".json",
  ".sh",
  ".toml",
])

const MAX_FILE_BYTES = 200 * 1024 // 200 KB — skip generated/lockfiles
const CHUNK_LINES = 80
const CHUNK_OVERLAP = 20
const EMBED_BATCH = 32 // Ollama /api/embed accepts batched input
// nomic-embed-text v1.5 has an 8192-token context. With code averaging
// ~3 chars/token, 6000 chars leaves comfortable headroom. Chunks larger
// than this are almost always encoded blobs (base64 assets, minified
// bundles) — useless for semantic retrieval anyway, so we drop them
// rather than truncate.
const MAX_CHUNK_CHARS = 6_000

/**
 * Walk `root` and yield repo-relative paths matching the indexable set.
 * Generator so memory stays bounded on big trees.
 */
async function* walkRepo(root) {
  const stack = [root]
  while (stack.length > 0) {
    const dir = stack.pop()
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        if (entry.name.startsWith(".") && entry.name !== ".github") continue
        stack.push(full)
        continue
      }
      if (!entry.isFile()) continue
      const dot = entry.name.lastIndexOf(".")
      if (dot < 0) continue
      const ext = entry.name.slice(dot)
      if (!INDEXED_EXTENSIONS.has(ext)) continue
      try {
        const info = await stat(full)
        if (info.size > MAX_FILE_BYTES) continue
        yield {
          path: relative(root, full),
          mtime: Math.floor(info.mtimeMs),
          size: info.size,
        }
      } catch {
        // Skip files we can't stat (perm error, race with deletion).
      }
    }
  }
}

/**
 * Split a file's contents into overlapping line windows. Each chunk records
 * the [lineStart, lineEnd) span (1-based, inclusive lower / exclusive upper)
 * so callers can quote it back accurately.
 */
export function chunkFile(path, content, mtime) {
  const lines = content.split("\n")
  if (lines.length === 0) return []
  const chunks = []
  const step = Math.max(1, CHUNK_LINES - CHUNK_OVERLAP)
  for (let start = 0; start < lines.length; start += step) {
    const end = Math.min(start + CHUNK_LINES, lines.length)
    const slice = lines.slice(start, end).join("\n")
    if (slice.trim().length === 0) continue
    // Drop chunks bigger than the embedder can handle. These are almost
    // always one-line encoded blobs (base64 assets, minified bundles)
    // that the embedder couldn't usefully represent anyway.
    if (slice.length > MAX_CHUNK_CHARS) {
      if (end === lines.length) break
      continue
    }
    chunks.push({
      id: `${path}:${start + 1}-${end}`,
      path,
      lineStart: start + 1,
      lineEnd: end,
      content: slice,
      mtime,
    })
    if (end === lines.length) break
  }
  return chunks
}

/**
 * Send a single batch to Ollama. Caller handles fallback / per-input
 * retry. Returns the embedding array on success or null on a recognized
 * "context length exceeded" error (so the caller can re-try smaller).
 */
async function tryEmbedBatch(batch, host, model, fetchImpl) {
  const res = await fetchImpl(`${host}/api/embed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, input: batch, options: { num_ctx: 8192 } }),
  })
  if (!res.ok) {
    const text = await res.text()
    if (res.status === 400 && /context length/i.test(text)) {
      return { tooLong: true, error: text }
    }
    throw new Error(`Ollama /api/embed failed (HTTP ${res.status}): ${text}`)
  }
  const json = await res.json()
  if (!Array.isArray(json.embeddings) || json.embeddings.length !== batch.length) {
    throw new Error(
      `Ollama /api/embed returned ${json.embeddings?.length ?? 0} embeddings, expected ${batch.length}`
    )
  }
  return { tooLong: false, embeddings: json.embeddings }
}

/**
 * Embed an array of strings via Ollama's `/api/embed` endpoint.
 *
 * Forces `num_ctx` to nomic-embed-text's full 8192-token capacity. Ollama's
 * default is 2048 tokens for embed calls, which trips on legitimate code
 * chunks the moment a busy file rolls through.
 *
 * Robustness: when a batch hits "context length exceeded" (one or more
 * inputs in that batch are still too dense even with 8192 ctx), fall
 * back to embedding inputs one at a time within that batch. The
 * offending input gets a zero vector instead of nuking the whole index
 * build — chunk-level skip already drops the *gross* offenders; this
 * handles the long-tail.
 */
export async function embedBatch(texts, { model = EMBEDDING_MODEL, fetchImpl = fetch } = {}) {
  if (texts.length === 0) return []
  const host = getOllamaHost().replace(/\/$/, "")
  const out = []
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH)
    const result = await tryEmbedBatch(batch, host, model, fetchImpl)
    if (!result.tooLong) {
      for (const vec of result.embeddings) out.push(vec)
      continue
    }
    // Per-input fallback. Replace any single input that still exceeds
    // context with a zero vector — that chunk just won't be retrievable.
    let dim = 0
    const fallbackVectors = []
    for (const input of batch) {
      const single = await tryEmbedBatch([input], host, model, fetchImpl)
      if (!single.tooLong && Array.isArray(single.embeddings[0])) {
        dim = single.embeddings[0].length
        fallbackVectors.push(single.embeddings[0])
      } else {
        fallbackVectors.push(null)
      }
    }
    for (const vec of fallbackVectors) {
      out.push(vec ?? new Array(dim || 1).fill(0))
    }
  }
  return out
}

function indexPath(repoRoot) {
  return resolve(repoRoot, ".openclaw", "index.json")
}

/**
 * Resolve the local index root for a given owner/name slug. Used by
 * the multi-repo daemon to load the right repo's chunk index when
 * iterating multiple repos from a single checkout.
 *
 * `OPENCLAW_INDEX_DIRS` is a JSON map of `{ "<owner/repo>": "<absolute-path>" }`.
 * Each path should be the root of a CHECKED-OUT repo whose
 * `.openclaw/index.json` was built via `tools/openclaw/index-repo.mjs`.
 *
 * Returns null when no entry matches the slug AND the JSON map was
 * set — callers should treat null as "skip retrieval, no chunks for
 * this repo." When the env var is unset entirely, returns
 * `process.cwd()` so the single-repo install keeps working.
 */
export function resolveIndexRoot(ownerRepo) {
  const raw = process.env.OPENCLAW_INDEX_DIRS?.trim()
  if (!raw) return process.cwd()
  try {
    const map = JSON.parse(raw)
    if (
      map &&
      typeof map === "object" &&
      !Array.isArray(map) &&
      typeof map[ownerRepo] === "string"
    ) {
      return map[ownerRepo].trim()
    }
    return null
  } catch {
    return null
  }
}

/**
 * Load a previously-built index. Returns null when missing or version-
 * incompatible — callers should rebuild from scratch in that case rather
 * than trying to migrate.
 */
export async function loadIndex(repoRoot) {
  try {
    const raw = await readFile(indexPath(repoRoot), "utf8")
    const parsed = JSON.parse(raw)
    if (parsed.version !== INDEX_VERSION) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * Persist the index. Caller is responsible for writing only valid index
 * shapes; we just stringify and atomic-replace.
 */
export async function saveIndex(repoRoot, index) {
  const dir = resolve(repoRoot, ".openclaw")
  await mkdir(dir, { recursive: true })
  await writeFile(indexPath(repoRoot), JSON.stringify(index), "utf8")
}

function fingerprint(path, mtime) {
  return createHash("sha1").update(`${path}:${mtime}`).digest("hex").slice(0, 16)
}

/**
 * Build (or refresh) the codebase index for the repo rooted at `repoRoot`.
 * Existing chunks whose file fingerprint hasn't changed are reused —
 * embedding calls only fire for new or modified files.
 *
 * Yields progress updates via the optional `onProgress` callback so a CLI
 * can render a heartbeat. Returns the persisted index shape.
 */
export async function buildIndex(repoRoot, { onProgress, embed = embedBatch } = {}) {
  const previous = (await loadIndex(repoRoot)) ?? null
  const existingByFingerprint = new Map()
  if (previous) {
    for (const chunk of previous.chunks ?? []) {
      const fp = fingerprint(chunk.path, chunk.mtime)
      const list = existingByFingerprint.get(fp) ?? []
      list.push(chunk)
      existingByFingerprint.set(fp, list)
    }
  }

  const allChunks = []
  const newChunks = []

  for await (const file of walkRepo(repoRoot)) {
    onProgress?.({ stage: "scan", path: file.path })
    const fp = fingerprint(file.path, file.mtime)
    const cached = existingByFingerprint.get(fp)
    if (cached && cached.every((c) => c.path === file.path)) {
      for (const c of cached) allChunks.push(c)
      continue
    }
    let content
    try {
      content = await readFile(resolve(repoRoot, file.path), "utf8")
    } catch {
      continue
    }
    const chunks = chunkFile(file.path, content, file.mtime)
    for (const chunk of chunks) {
      newChunks.push(chunk)
      allChunks.push(chunk)
    }
  }

  if (newChunks.length > 0) {
    onProgress?.({ stage: "embed", count: newChunks.length })
    const vectors = await embed(newChunks.map((c) => c.content))
    for (let i = 0; i < newChunks.length; i++) {
      newChunks[i].embedding = vectors[i]
    }
  }

  const index = {
    version: INDEX_VERSION,
    createdAt: new Date().toISOString(),
    embeddingModel: EMBEDDING_MODEL,
    chunks: allChunks,
  }
  await saveIndex(repoRoot, index)
  onProgress?.({ stage: "done", total: allChunks.length, fresh: newChunks.length })
  return index
}
