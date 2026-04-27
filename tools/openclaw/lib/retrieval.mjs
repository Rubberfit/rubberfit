// Retrieval helpers for OpenClaw v3 — given a query string, return the
// top-K codebase chunks ranked by cosine similarity to the query's
// embedding. Pairs with `lib/indexer.mjs`.
import { embedBatch } from "./indexer.mjs"

/**
 * Standard cosine similarity between two equal-length numeric vectors.
 * Returns 0 for empty / mismatched / zero-norm inputs rather than NaN so
 * downstream sorting is well-defined.
 */
export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Rank `chunks` by similarity to `queryVector`, return the top `k`. Pure
 * function so this is unit-testable without an Ollama dependency.
 */
export function rankChunks(queryVector, chunks, k = 5, { excludePaths = new Set() } = {}) {
  if (!Array.isArray(chunks) || chunks.length === 0) return []
  const scored = []
  for (const chunk of chunks) {
    if (excludePaths.has(chunk.path)) continue
    if (!Array.isArray(chunk.embedding)) continue
    const score = cosineSimilarity(queryVector, chunk.embedding)
    scored.push({ chunk, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, k)
}

/**
 * Build a retrieval query from a CI failure log + PR diff. Concatenates
 * the most diagnostic lines (error messages, stack frame paths, diff
 * hunk headers) into one string the embedding model can attend to. Cap
 * at ~2000 chars so the embedder doesn't blow up on multi-MB logs.
 */
export function buildRetrievalQuery({ ciLog = "", prDiff = "" } = {}) {
  // Scan line-by-line so a trigger word anywhere in the line surfaces the
  // whole line (the trigger word is rarely the most-informative part —
  // the surrounding context is what tells the embedder what failed).
  const triggerPattern = /\b(?:Error|Failed|FAIL|TS\d{4,5}|expected|got)\b/i
  const errorLines = []
  for (const line of ciLog.split("\n")) {
    if (line.trim().length === 0) continue
    if (triggerPattern.test(line)) {
      errorLines.push(line)
      if (errorLines.length >= 12) break
    }
  }

  const hunkHeaders = []
  for (const line of prDiff.split("\n")) {
    if (line.startsWith("diff --git ") || line.startsWith("@@ ")) {
      hunkHeaders.push(line)
      if (hunkHeaders.length >= 20) break
    }
  }

  const query = [...errorLines, ...hunkHeaders].join("\n").slice(0, 2_000)
  return query.length > 0 ? query : ciLog.slice(0, 2_000)
}

/**
 * High-level: build a query from triage context, embed it, rank the
 * indexed chunks. Returns `[]` when the index is missing/empty so
 * callers can no-op gracefully.
 */
export async function retrieveRelatedChunks({
  index,
  ciLog,
  prDiff,
  excludePaths = new Set(),
  k = 5,
  embed = embedBatch,
}) {
  if (!index || !Array.isArray(index.chunks) || index.chunks.length === 0) return []
  const query = buildRetrievalQuery({ ciLog, prDiff })
  if (!query) return []
  const [queryVector] = await embed([query], {
    model: index.embeddingModel ?? "nomic-embed-text",
  })
  if (!Array.isArray(queryVector)) return []
  return rankChunks(queryVector, index.chunks, k, { excludePaths })
}
