/**
 * Unit tests for OpenClaw v3 retrieval helpers — pure cosine similarity,
 * top-K ranking, and query construction. No live Ollama or filesystem.
 */
import { describe, expect, it } from "vitest"

import {
  buildRetrievalQuery,
  cosineSimilarity,
  rankChunks,
} from "@/tools/openclaw/lib/retrieval.mjs"

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6)
  })

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0)
  })

  it("returns -1 for antiparallel vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [-1, -2, -3])).toBeCloseTo(-1, 6)
  })

  it("returns 0 when either vector is all zero (no spurious NaN)", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0)
    expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0)
  })

  it("returns 0 for mismatched lengths", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0)
  })

  it("returns 0 for non-array input", () => {
    expect(cosineSimilarity(null as unknown as number[], [1])).toBe(0)
    expect(cosineSimilarity([1], "x" as unknown as number[])).toBe(0)
  })
})

describe("rankChunks", () => {
  const chunkA = { id: "a", path: "a.ts", lineStart: 1, lineEnd: 5, content: "", embedding: [1, 0] }
  const chunkB = { id: "b", path: "b.ts", lineStart: 1, lineEnd: 5, content: "", embedding: [0, 1] }
  const chunkC = {
    id: "c",
    path: "c.ts",
    lineStart: 1,
    lineEnd: 5,
    content: "",
    embedding: [1, 1],
  }

  it("returns chunks sorted by descending similarity to the query", () => {
    const result = rankChunks([1, 0], [chunkA, chunkB, chunkC])
    expect(result.map((r) => r.chunk.path)).toEqual(["a.ts", "c.ts", "b.ts"])
  })

  it("respects the top-K cap", () => {
    const result = rankChunks([1, 0], [chunkA, chunkB, chunkC], 2)
    expect(result).toHaveLength(2)
  })

  it("excludes paths in the excludePaths set", () => {
    const result = rankChunks([1, 0], [chunkA, chunkB, chunkC], 5, {
      excludePaths: new Set(["a.ts"]),
    })
    expect(result.map((r) => r.chunk.path)).not.toContain("a.ts")
  })

  it("skips chunks missing an embedding", () => {
    const broken = { id: "x", path: "x.ts", lineStart: 1, lineEnd: 5, content: "" }
    const result = rankChunks([1, 0], [chunkA, broken as unknown as typeof chunkA])
    expect(result.map((r) => r.chunk.path)).toEqual(["a.ts"])
  })

  it("returns empty for empty inputs", () => {
    expect(rankChunks([1, 0], [])).toEqual([])
    expect(rankChunks([1, 0], null as unknown as (typeof chunkA)[])).toEqual([])
  })
})

describe("buildRetrievalQuery", () => {
  it("captures error lines from a typical Vitest log", () => {
    const ciLog = `
      ❯ tests/foo.test.ts:42:20
      AssertionError: expected 1 to be 2
      Error: connect ECONNREFUSED 127.0.0.1:5432
    `
    const query = buildRetrievalQuery({ ciLog })
    expect(query).toContain("AssertionError: expected 1 to be 2")
    expect(query).toContain("Error: connect ECONNREFUSED")
  })

  it("captures TypeScript error codes", () => {
    const ciLog = "src/foo.ts(12,5): error TS2339: Property 'foo' does not exist on type 'Bar'."
    const query = buildRetrievalQuery({ ciLog })
    expect(query).toContain("TS2339")
  })

  it("includes diff hunk headers from the PR", () => {
    const prDiff = `diff --git a/foo.ts b/foo.ts
index abc..def 100644
--- a/foo.ts
+++ b/foo.ts
@@ -10,5 +10,5 @@ function foo() {
-  return 1
+  return 2
 }`
    const query = buildRetrievalQuery({ ciLog: "", prDiff })
    expect(query).toContain("diff --git a/foo.ts b/foo.ts")
    expect(query).toContain("@@ -10,5 +10,5 @@")
  })

  it("falls back to a slice of the CI log when no error / hunk lines match", () => {
    const ciLog = "completely unstructured noise that doesn't match any heuristic"
    const query = buildRetrievalQuery({ ciLog })
    // Falls back to log slice so the embed call still has signal.
    expect(query).toBe(ciLog)
  })

  it("returns empty when nothing is provided", () => {
    expect(buildRetrievalQuery({})).toBe("")
  })

  it("caps query length at 2000 chars", () => {
    const ciLog = `Error: ${"x".repeat(10_000)}`
    const query = buildRetrievalQuery({ ciLog })
    expect(query.length).toBeLessThanOrEqual(2_000)
  })
})
