/**
 * Unit tests for the OpenClaw CI triage prompt builder. The builder lives
 * in pure ESM (no I/O outside reading the prompt template), so we exercise
 * truncation, file-mention extraction, and confidence parsing without
 * spinning up gh CLI or Ollama.
 */
import { describe, expect, it } from "vitest"

import {
  buildTriagePrompt,
  extractMentionedFiles,
  parseConfidence,
  truncate,
} from "@/tools/openclaw/lib/build-prompt.mjs"

describe("truncate", () => {
  it("returns the original when under the limit", () => {
    expect(truncate("hello world", 100)).toBe("hello world")
  })

  it("appends a marker when content exceeds the limit", () => {
    const result = truncate("a".repeat(200), 50)
    expect(result.length).toBe(50)
    expect(result.endsWith("[…truncated…]")).toBe(true)
  })

  it("returns an empty string when input is not a string", () => {
    expect(truncate(undefined as unknown as string, 100)).toBe("")
    expect(truncate(null as unknown as string, 100)).toBe("")
  })
})

describe("extractMentionedFiles", () => {
  it("pulls TypeScript paths from typical Vitest output", () => {
    const log = `
      ❯ tests/exports/issue-122-operations-overview.test.ts:73:20
      ❯ app/dashboard/_components/dashboard-export-utils.ts:45:14
    `
    expect(extractMentionedFiles(log)).toEqual([
      "tests/exports/issue-122-operations-overview.test.ts",
      "app/dashboard/_components/dashboard-export-utils.ts",
    ])
  })

  it("dedupes paths that appear multiple times", () => {
    const log = `
      app/foo.ts:1:1 expected
      app/foo.ts:42:5 actually
      app/foo.ts:99:1 third hit
    `
    expect(extractMentionedFiles(log)).toEqual(["app/foo.ts"])
  })

  it("preserves first-mention order across mixed extensions", () => {
    const log = `
      Build error in engine/crates/rf-layout/src/polish.rs:120:5
      Then test failure: tests/cutting-engine/issue-128.test.ts:30:1
      .github/workflows/lint.yml:14:3 also flagged
    `
    expect(extractMentionedFiles(log)).toEqual([
      "engine/crates/rf-layout/src/polish.rs",
      "tests/cutting-engine/issue-128.test.ts",
      ".github/workflows/lint.yml",
    ])
  })

  it("ignores text that looks like a path but lacks a line number", () => {
    const log = "checked app/foo.ts and bar/baz.tsx but no line number was reported"
    expect(extractMentionedFiles(log)).toEqual([])
  })

  it("returns an empty list for empty or non-string input", () => {
    expect(extractMentionedFiles("")).toEqual([])
    expect(extractMentionedFiles(undefined as unknown as string)).toEqual([])
  })
})

describe("parseConfidence", () => {
  it("returns the rated level when the model uses the bold token form", () => {
    expect(parseConfidence("…\n**Confidence:** high")).toBe("high")
    expect(parseConfidence("…\n**Confidence:** Medium")).toBe("medium")
    expect(parseConfidence("…\n**Confidence:** LOW")).toBe("low")
  })

  it("tolerates wrapped formatting around the rating", () => {
    expect(parseConfidence("Confidence: `high`")).toBe("high")
    expect(parseConfidence("**Confidence:** _medium_")).toBe("medium")
  })

  it("returns null when the rating token is missing", () => {
    expect(parseConfidence("nothing structured here")).toBeNull()
    expect(parseConfidence("")).toBeNull()
    expect(parseConfidence(undefined as unknown as string)).toBeNull()
  })
})

describe("buildTriagePrompt", () => {
  const baseCtx = {
    prNumber: 145,
    prTitle: "fix(dashboard): wire Export buttons",
    prBody: "Fixes the Export action on Operations overview.",
    prDiff: "diff --git a/foo b/foo\n+const x = 1\n",
    ciLog: "FAIL tests/exports/issue.test.ts:42:1 Expected 1 got 2",
    fileContexts: [{ path: "tests/exports/issue.test.ts", content: "expect(2).toBe(1)" }],
  }

  it("includes the system instructions verbatim", async () => {
    const prompt = await buildTriagePrompt(baseCtx)
    expect(prompt).toContain("You are **OpenClaw**")
    expect(prompt).toContain("[SYSTEM INSTRUCTIONS]")
  })

  it("includes the PR metadata, diff, and CI log sections", async () => {
    const prompt = await buildTriagePrompt(baseCtx)
    expect(prompt).toContain("Number: #145")
    expect(prompt).toContain("Title: fix(dashboard): wire Export buttons")
    expect(prompt).toContain("[PR DIFF (truncated)]")
    expect(prompt).toContain("[FAILED CI LOG (filtered to failed steps, truncated)]")
  })

  it("includes affected file context when provided", async () => {
    const prompt = await buildTriagePrompt(baseCtx)
    expect(prompt).toContain("[AFFECTED FILE CONTEXT]")
    expect(prompt).toContain("--- tests/exports/issue.test.ts ---")
    expect(prompt).toContain("expect(2).toBe(1)")
  })

  it("omits the file-context section when none is provided", async () => {
    const prompt = await buildTriagePrompt({ ...baseCtx, fileContexts: [] })
    expect(prompt).not.toContain("[AFFECTED FILE CONTEXT]")
  })

  it("truncates oversized PR bodies with the marker", async () => {
    const huge = "x".repeat(10_000)
    const prompt = await buildTriagePrompt({ ...baseCtx, prBody: huge })
    // Body limit is 4000 chars; the marker should be present.
    expect(prompt).toContain("[…truncated…]")
  })

  it("ends with an [OUTPUT] section instructing the model to skip preamble", async () => {
    const prompt = await buildTriagePrompt(baseCtx)
    expect(prompt.trimEnd().endsWith("No preamble.")).toBe(true)
  })
})
