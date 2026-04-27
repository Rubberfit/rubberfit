/**
 * Unit tests for the v4 CR evaluator. Pure parsing + prompt-shape tests
 * — no live model, no GitHub. The actual model call lives in the
 * triage-cr.mjs orchestrator, which we exercise manually against
 * staging PRs.
 */
import { describe, expect, it } from "vitest"

import {
  buildEvaluatorPrompt,
  parseEvaluatorResponse,
  stripCRAgentPrompt,
} from "@/tools/openclaw/lib/cr-evaluator.mjs"

describe("stripCRAgentPrompt", () => {
  it("removes the CR 'Prompt for AI Agents' details block", () => {
    const body = `Here's the human-facing comment.

<details>
<summary>🤖 Prompt for AI Agents</summary>

\`\`\`
Verify each finding…
\`\`\`

</details>

More human text below.`
    const cleaned = stripCRAgentPrompt(body)
    expect(cleaned).toContain("Here's the human-facing comment.")
    expect(cleaned).toContain("More human text below.")
    expect(cleaned).not.toContain("Prompt for AI Agents")
    expect(cleaned).not.toContain("Verify each finding")
  })

  it("leaves bodies without the AI-Agents block untouched", () => {
    const body = "Plain CR comment with no details block."
    expect(stripCRAgentPrompt(body)).toBe(body)
  })

  it("returns empty for non-string input", () => {
    expect(stripCRAgentPrompt(undefined as unknown as string)).toBe("")
  })
})

describe("parseEvaluatorResponse", () => {
  it("parses a clean JSON array of verdicts", () => {
    const out = parseEvaluatorResponse(
      JSON.stringify([
        { commentId: 1, classification: "ACCEPT", reason: "Real bug", suggestion: "fix it" },
        {
          commentId: 2,
          classification: "SKIP_NITPICK",
          reason: "Stylistic only",
          skipReply: "skipping",
        },
      ])
    )
    expect(out).toEqual([
      { commentId: 1, classification: "ACCEPT", reason: "Real bug", suggestion: "fix it" },
      {
        commentId: 2,
        classification: "SKIP_NITPICK",
        reason: "Stylistic only",
        skipReply: "skipping",
      },
    ])
  })

  it("strips a surrounding ```json fence", () => {
    const text = '```json\n[{"commentId": 1, "classification": "ACCEPT", "reason": "r"}]\n```'
    const out = parseEvaluatorResponse(text)
    expect(out).toHaveLength(1)
    expect(out?.[0].classification).toBe("ACCEPT")
  })

  it("strips a surrounding plain ``` fence", () => {
    const text =
      '```\n[{"commentId": 7, "classification": "SKIP_FALSE_POSITIVE", "reason": "wrong"}]\n```'
    const out = parseEvaluatorResponse(text)
    expect(out?.[0].commentId).toBe(7)
  })

  it("returns null when the output isn't a JSON array", () => {
    expect(parseEvaluatorResponse("not json at all")).toBeNull()
    expect(parseEvaluatorResponse('{ "comments": [] }')).toBeNull()
  })

  it("returns null when any verdict has an unknown classification", () => {
    const out = parseEvaluatorResponse(
      JSON.stringify([{ commentId: 1, classification: "MAYBE", reason: "r" }])
    )
    expect(out).toBeNull()
  })

  it("returns null when commentId is missing or non-numeric", () => {
    expect(
      parseEvaluatorResponse(JSON.stringify([{ classification: "ACCEPT", reason: "r" }]))
    ).toBeNull()
    expect(
      parseEvaluatorResponse(
        JSON.stringify([{ commentId: "abc", classification: "ACCEPT", reason: "r" }])
      )
    ).toBeNull()
  })

  it("omits suggestion / skipReply fields when missing in the source", () => {
    const out = parseEvaluatorResponse(
      JSON.stringify([
        { commentId: 1, classification: "ACCEPT", reason: "r" },
        { commentId: 2, classification: "SKIP_NITPICK", reason: "r" },
      ])
    )
    expect(out?.[0].suggestion).toBeUndefined()
    expect(out?.[0].skipReply).toBeUndefined()
    expect(out?.[1].suggestion).toBeUndefined()
    expect(out?.[1].skipReply).toBeUndefined()
  })
})

describe("buildEvaluatorPrompt", () => {
  const baseCtx = {
    prNumber: 146,
    prTitle: "fix(cutting-engine): label every reusable offcut in cut history PDF (#128)",
    prBody: "Closes #128",
    prDiff: "diff --git a/foo b/foo\n+const x = 1\n",
    comments: [
      {
        id: 12345,
        path: "tools/openclaw/lib/comments.mjs",
        line: 42,
        body: "Consider extracting this into a shared util.",
      },
      {
        id: 12346,
        path: "app/dashboard/cutting-engine/_components/cut-history-pdf.ts",
        line: 482,
        body: "Real issue: missing null check.",
      },
    ],
  }

  it("includes the system instructions verbatim", async () => {
    const prompt = await buildEvaluatorPrompt(baseCtx)
    expect(prompt).toContain("You are **OpenClaw**")
    expect(prompt).toContain("[SYSTEM INSTRUCTIONS]")
  })

  it("renders each CR comment with its commentId and file:line", async () => {
    const prompt = await buildEvaluatorPrompt(baseCtx)
    expect(prompt).toContain("commentId=12345")
    expect(prompt).toContain("commentId=12346")
    expect(prompt).toContain("tools/openclaw/lib/comments.mjs:42")
    expect(prompt).toContain("app/dashboard/cutting-engine/_components/cut-history-pdf.ts:482")
  })

  it("strips the CR AI-Agent prompt block from comment bodies before embedding", async () => {
    const ctx = {
      ...baseCtx,
      comments: [
        {
          id: 99,
          path: "x.ts",
          line: 1,
          body: `Real comment text.

<details>
<summary>🤖 Prompt for AI Agents</summary>

Internal CR prompt that we don't want our model to see.

</details>`,
        },
      ],
    }
    const prompt = await buildEvaluatorPrompt(ctx)
    expect(prompt).toContain("Real comment text.")
    expect(prompt).not.toContain("Prompt for AI Agents")
    expect(prompt).not.toContain("Internal CR prompt")
  })

  it("ends with the [OUTPUT] section instructing JSON-only output", async () => {
    const prompt = await buildEvaluatorPrompt(baseCtx)
    expect(
      prompt.trimEnd().endsWith("Return only the JSON array. No prose, no Markdown fence.")
    ).toBe(true)
  })
})
