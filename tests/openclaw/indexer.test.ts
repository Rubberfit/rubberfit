/**
 * Unit tests for OpenClaw v3 indexer pieces — chunking + persistence
 * round-trip + incremental rebuild. The embedding step is mocked so the
 * suite stays self-contained (no Ollama required).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { buildIndex, chunkFile, loadIndex, saveIndex } from "@/tools/openclaw/lib/indexer.mjs"

interface IndexedChunk {
  id: string
  path: string
  lineStart: number
  lineEnd: number
  content: string
  mtime: number
  embedding?: number[]
}

describe("chunkFile", () => {
  it("emits a single chunk for a short file", () => {
    const content = "line 1\nline 2\nline 3\n"
    const chunks = chunkFile("foo.ts", content, 1) as IndexedChunk[]
    expect(chunks).toHaveLength(1)
    expect(chunks[0].path).toBe("foo.ts")
    expect(chunks[0].lineStart).toBe(1)
    expect(chunks[0].content).toBe(content)
  })

  it("splits long files into overlapping line windows", () => {
    const content = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`).join("\n")
    const chunks = chunkFile("big.ts", content, 0) as IndexedChunk[]
    expect(chunks.length).toBeGreaterThan(1)
    // First chunk covers lines 1-80
    expect(chunks[0].lineStart).toBe(1)
    expect(chunks[0].lineEnd).toBe(80)
    // Second chunk should overlap with the first by CHUNK_OVERLAP=20 lines
    expect(chunks[1].lineStart).toBe(61)
  })

  it("skips whitespace-only chunks", () => {
    const content = "\n".repeat(120)
    const chunks = chunkFile("blank.ts", content, 0)
    expect(chunks).toEqual([])
  })

  it("encodes the line range into the chunk id", () => {
    const content = Array.from({ length: 50 }, (_, i) => `// line ${i}`).join("\n")
    const [chunk] = chunkFile("foo.ts", content, 0) as IndexedChunk[]
    expect(chunk.id).toBe("foo.ts:1-50")
  })

  it("drops chunks larger than the embedder context (e.g., base64 assets)", () => {
    // One huge single-line file — mimics the arc-anchor-logo base64 blob.
    const huge = "x".repeat(12_000)
    expect(chunkFile("logo.ts", huge, 0)).toEqual([])
  })

  it("keeps surrounding chunks while skipping the oversize one in a mixed file", () => {
    // First 80 lines are normal code, then a huge single line, then more code.
    const normalBlock = Array.from({ length: 80 }, (_, i) => `const a${i} = ${i}`).join("\n")
    const oversize = "y".repeat(10_000)
    const tail = Array.from({ length: 80 }, (_, i) => `const b${i} = ${i}`).join("\n")
    const content = `${normalBlock}\n${oversize}\n${tail}`
    const chunks = chunkFile("mixed.ts", content, 0) as IndexedChunk[]
    // The chunk window that captures the oversize line gets dropped, but
    // chunks surrounding it (normal code) still index.
    expect(chunks.length).toBeGreaterThan(0)
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(6_000)
    }
  })
})

describe("loadIndex / saveIndex round-trip", () => {
  let tmpRoot: string

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), "openclaw-indexer-test-"))
  })

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  it("returns null when no index has been saved", async () => {
    expect(await loadIndex(tmpRoot)).toBeNull()
  })

  it("persists and reloads the same shape", async () => {
    const original = {
      version: 1,
      createdAt: "2026-04-27T00:00:00.000Z",
      embeddingModel: "nomic-embed-text",
      chunks: [
        {
          id: "foo.ts:1-10",
          path: "foo.ts",
          lineStart: 1,
          lineEnd: 10,
          content: "x",
          mtime: 1,
          embedding: [0.1, 0.2, 0.3],
        },
      ],
    }
    await saveIndex(tmpRoot, original)
    const reloaded = await loadIndex(tmpRoot)
    expect(reloaded).toEqual(original)
  })

  it("returns null for index files with an unsupported version", async () => {
    await mkdir(join(tmpRoot, ".openclaw"), { recursive: true })
    await writeFile(join(tmpRoot, ".openclaw", "index.json"), JSON.stringify({ version: 999 }))
    expect(await loadIndex(tmpRoot)).toBeNull()
  })
})

describe("buildIndex", () => {
  let tmpRoot: string

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), "openclaw-build-test-"))
    await mkdir(join(tmpRoot, "src"), { recursive: true })
    await writeFile(join(tmpRoot, "src", "foo.ts"), "export const foo = 1\nexport const bar = 2\n")
    await writeFile(join(tmpRoot, "src", "baz.ts"), "// hello\nexport const baz = 3\n")
  })

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  it("indexes every TS file under the root and persists embeddings", async () => {
    const fakeEmbed = async (texts: string[]) => texts.map((_, i) => [i, i + 1])
    const index = await buildIndex(tmpRoot, { embed: fakeEmbed })
    expect(index.version).toBe(1)
    expect(index.chunks.length).toBeGreaterThanOrEqual(2)
    for (const chunk of index.chunks) {
      expect(Array.isArray(chunk.embedding)).toBe(true)
    }
  })

  it("reuses cached embeddings for files that haven't changed", async () => {
    let embedCalls = 0
    const fakeEmbed = async (texts: string[]) => {
      embedCalls += 1
      return texts.map(() => [1, 2, 3])
    }
    await buildIndex(tmpRoot, { embed: fakeEmbed })
    const callsAfterFirst = embedCalls
    expect(callsAfterFirst).toBeGreaterThan(0)

    // Second build with no file changes — should NOT call the embedder.
    await buildIndex(tmpRoot, { embed: fakeEmbed })
    expect(embedCalls).toBe(callsAfterFirst)
  })

  it("re-embeds files whose mtime changes", async () => {
    let embedCalls = 0
    const fakeEmbed = async (texts: string[]) => {
      embedCalls += 1
      return texts.map(() => [1, 2, 3])
    }
    await buildIndex(tmpRoot, { embed: fakeEmbed })
    const baseline = embedCalls

    // Touch a file with new content to bump mtime + invalidate the cached
    // chunk fingerprint.
    await writeFile(join(tmpRoot, "src", "foo.ts"), "// edited\nexport const foo = 999\n")
    await buildIndex(tmpRoot, { embed: fakeEmbed })
    expect(embedCalls).toBeGreaterThan(baseline)
  })

  it("writes the index JSON to .openclaw/index.json", async () => {
    const fakeEmbed = async (texts: string[]) => texts.map(() => [0.1])
    await buildIndex(tmpRoot, { embed: fakeEmbed })
    const onDisk = JSON.parse(await readFile(join(tmpRoot, ".openclaw", "index.json"), "utf8"))
    expect(onDisk.version).toBe(1)
    expect(Array.isArray(onDisk.chunks)).toBe(true)
  })
})
