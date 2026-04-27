/**
 * Unit tests for the v5 issue-triage helpers — prompt assembly, model
 * output parsing, and comment formatting. No live model, no GitHub.
 */
import { describe, expect, it } from "vitest"

import {
  buildIssueTriagePrompt,
  formatIssueTriageComment,
  parseIssueTriageResponse,
} from "@/tools/openclaw/lib/issue-triage.mjs"

describe("buildIssueTriagePrompt", () => {
  const baseCtx = {
    issueNumber: 122,
    issueTitle: "Export button not working on the dashboard",
    issueBody: "Clicking the export button does nothing on Operations overview.",
    issueAuthor: "stevenfojas670",
    labels: ["bug", "ui"],
  }

  it("includes the system instructions", async () => {
    const prompt = await buildIssueTriagePrompt(baseCtx)
    expect(prompt).toContain("You are **OpenClaw**")
    expect(prompt).toContain("[SYSTEM INSTRUCTIONS]")
  })

  it("renders the issue metadata block with number, title, author, labels", async () => {
    const prompt = await buildIssueTriagePrompt(baseCtx)
    expect(prompt).toContain("Number: #122")
    expect(prompt).toContain("Title: Export button not working on the dashboard")
    expect(prompt).toContain("Author: stevenfojas670")
    expect(prompt).toContain("Existing labels: bug, ui")
  })

  it("includes retrieved chunks when provided", async () => {
    const prompt = await buildIssueTriagePrompt({
      ...baseCtx,
      retrievedChunks: [
        {
          path: "app/dashboard/page.tsx",
          lineStart: 198,
          lineEnd: 201,
          content: "<Button>Export</Button>",
          score: 0.91,
        },
      ],
    })
    expect(prompt).toContain("[RELEVANT CODEBASE CHUNKS")
    expect(prompt).toContain("--- app/dashboard/page.tsx:198-201")
    expect(prompt).toContain("<Button>Export</Button>")
  })

  it("omits the codebase-chunks section when nothing was retrieved", async () => {
    const prompt = await buildIssueTriagePrompt(baseCtx)
    expect(prompt).not.toContain("[RELEVANT CODEBASE CHUNKS")
  })

  it("ends with the [OUTPUT] section instructing single-object JSON", async () => {
    const prompt = await buildIssueTriagePrompt(baseCtx)
    expect(
      prompt
        .trimEnd()
        .endsWith("Return only the JSON object. No prose, no Markdown fence, no array.")
    ).toBe(true)
  })
})

describe("parseIssueTriageResponse", () => {
  it("parses a clean verdict object", () => {
    const out = parseIssueTriageResponse(
      JSON.stringify({
        headline: "Export button has no onClick handler",
        severity: "P1",
        estimate: "trivial",
        labels: ["bug", "ui"],
        summary: "The Operations overview Export button is unwired.",
        approach: "Add an onClick handler in `app/dashboard/page.tsx:200`.",
        relevantFiles: ["app/dashboard/page.tsx:200"],
      })
    )
    expect(out).toMatchObject({
      headline: "Export button has no onClick handler",
      severity: "P1",
      estimate: "trivial",
      labels: ["bug", "ui"],
      summary: "The Operations overview Export button is unwired.",
      relevantFiles: ["app/dashboard/page.tsx:200"],
    })
  })

  it("captures the optional research field when present", () => {
    const out = parseIssueTriageResponse(
      JSON.stringify({
        headline: "h",
        severity: "P2",
        estimate: "S",
        summary: "s",
        approach: "a",
        research: "Standard event-handler pattern in React docs.",
      })
    )
    expect(out?.research).toBe("Standard event-handler pattern in React docs.")
  })

  it("captures the optional diagram field, stripping an accidental mermaid fence", () => {
    const out = parseIssueTriageResponse(
      JSON.stringify({
        headline: "h",
        severity: "P2",
        estimate: "S",
        summary: "s",
        diagram: "```mermaid\ngraph LR\n  A-->B\n```",
      })
    )
    expect(out?.diagram).toBe("graph LR\n  A-->B")
  })

  it("strips internal triple backticks so the rendered fenced block can't break", () => {
    const out = parseIssueTriageResponse(
      JSON.stringify({
        headline: "h",
        severity: "P2",
        estimate: "S",
        summary: "s",
        diagram: "graph LR\n  A-->B\n```\nstray fence\n```",
      })
    )
    expect(out?.diagram).not.toContain("```")
    expect(out?.diagram).toContain("graph LR")
  })

  it("leaves diagram undefined when omitted or empty", () => {
    const out1 = parseIssueTriageResponse(
      JSON.stringify({ headline: "h", severity: "P2", estimate: "S", summary: "s" })
    )
    expect(out1?.diagram).toBeUndefined()
    const out2 = parseIssueTriageResponse(
      JSON.stringify({ headline: "h", severity: "P2", estimate: "S", summary: "s", diagram: "" })
    )
    expect(out2?.diagram).toBeUndefined()
  })

  it("strips a surrounding ```json fence", () => {
    const text = '```json\n{"headline":"h","severity":"P1","estimate":"S","summary":"s"}\n```'
    const out = parseIssueTriageResponse(text)
    expect(out?.severity).toBe("P1")
  })

  it("uppercases severity and tolerates lowercase model output", () => {
    const out = parseIssueTriageResponse(
      JSON.stringify({ headline: "h", severity: "p2", estimate: "M", summary: "s" })
    )
    expect(out?.severity).toBe("P2")
  })

  it("returns null when the output is an array (model emitted PR-eval shape by mistake)", () => {
    const out = parseIssueTriageResponse(
      JSON.stringify([{ headline: "h", severity: "P1", estimate: "S", summary: "s" }])
    )
    expect(out).toBeNull()
  })

  it("returns null when severity is invalid", () => {
    expect(
      parseIssueTriageResponse(
        JSON.stringify({ headline: "h", severity: "URGENT", estimate: "S", summary: "s" })
      )
    ).toBeNull()
  })

  it("returns null when estimate is invalid", () => {
    expect(
      parseIssueTriageResponse(
        JSON.stringify({ headline: "h", severity: "P1", estimate: "huge", summary: "s" })
      )
    ).toBeNull()
  })

  it("returns null when headline or summary is empty", () => {
    expect(
      parseIssueTriageResponse(
        JSON.stringify({ headline: "", severity: "P1", estimate: "S", summary: "s" })
      )
    ).toBeNull()
    expect(
      parseIssueTriageResponse(
        JSON.stringify({ headline: "h", severity: "P1", estimate: "S", summary: "" })
      )
    ).toBeNull()
  })

  it("defaults missing optional fields to safe values", () => {
    const out = parseIssueTriageResponse(
      JSON.stringify({ headline: "h", severity: "P1", estimate: "S", summary: "s" })
    )
    expect(out?.labels).toEqual([])
    expect(out?.relevantFiles).toEqual([])
    expect(out?.research).toBeUndefined()
    expect(out?.approach).toBe("")
  })
})

describe("formatIssueTriageComment", () => {
  const verdict = {
    headline: "Export button has no onClick handler",
    severity: "P1",
    estimate: "trivial",
    labels: ["bug", "ui"],
    summary: "The Operations overview Export button is unwired.",
    approach: "Add an onClick handler in `app/dashboard/page.tsx:200`.",
    relevantFiles: ["app/dashboard/page.tsx:200"],
    research: "Same pattern Inventory uses (see `app/dashboard/inventory/page.tsx:60`).",
  }

  it("renders the bracketed [severity · estimate] tag plus headline as the first content line", () => {
    const body = formatIssueTriageComment({
      verdict,
      author: "stevenfojas670",
      marker: "<!-- m -->",
    })
    const lines = body.split("\n")
    expect(lines[0]).toBe("<!-- m -->")
    expect(lines[1]).toBe("🦞 [P1 · trivial] Export button has no onClick handler")
  })

  it("@-mentions the issue author when present", () => {
    const body = formatIssueTriageComment({
      verdict,
      author: "stevenfojas670",
      marker: "<!-- m -->",
    })
    expect(body).toContain("@stevenfojas670 — first read on your issue")
  })

  it("skips the @-mention for [bot] authors", () => {
    const body = formatIssueTriageComment({
      verdict,
      author: "dependabot[bot]",
      marker: "<!-- m -->",
    })
    expect(body).not.toContain("@dependabot[bot]")
  })

  it("includes summary, approach, relevant files, research, and suggested labels", () => {
    const body = formatIssueTriageComment({
      verdict,
      author: "stevenfojas670",
      marker: "<!-- m -->",
    })
    expect(body).toContain("**Summary:** The Operations overview Export button is unwired.")
    expect(body).toContain("**Approach:**")
    expect(body).toContain("**Relevant files:**")
    expect(body).toContain("- `app/dashboard/page.tsx:200`")
    expect(body).toContain("**Prior art / research:** Same pattern Inventory uses")
    expect(body).toContain("_Suggested labels:_")
    expect(body).toContain("`bug`")
    expect(body).toContain("`ui`")
  })

  it("omits the research line when the verdict has no research field", () => {
    const v = { ...verdict, research: undefined }
    const body = formatIssueTriageComment({ verdict: v, author: null, marker: "<!-- m -->" })
    expect(body).not.toContain("Prior art")
  })

  it("does not append a trailing advisory or signature line", () => {
    const body = formatIssueTriageComment({
      verdict,
      author: "stevenfojas670",
      marker: "<!-- m -->",
    })
    expect(body).not.toContain("Auto-triage")
    expect(body).not.toContain("adjust as you scope")
  })
})
