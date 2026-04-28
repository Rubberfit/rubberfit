/**
 * Pure helper tests for OpenClaw v7 mention detection. The helpers
 * are what gate whether the bot replies — quoting fences, code
 * blocks, and known-bot authors all have to short-circuit before
 * we spend a model call.
 */
import { describe, expect, it } from "vitest"

import {
  bodyMentionsBot,
  formatMentionReply,
  isKnownBotAuthor,
  parseMentionResponse,
  stripMentionFromBody,
  stripQuotesAndCode,
} from "@/tools/openclaw/lib/mention-detection.mjs"

describe("bodyMentionsBot", () => {
  it("matches a plain @openclaw-devops mention", () => {
    expect(bodyMentionsBot("@openclaw-devops what's the right approach here?")).toBe(true)
  })

  it("matches @openclaw[bot] form", () => {
    expect(bodyMentionsBot("hey @openclaw[bot] question for you")).toBe(true)
  })

  it("ignores mentions inside fenced code blocks", () => {
    const body = "Here's a snippet:\n```\n@openclaw-devops should ignore this\n```\nthanks"
    expect(bodyMentionsBot(body)).toBe(false)
  })

  it("ignores mentions inside blockquotes (someone quoting prior message)", () => {
    const body = "> @openclaw-devops what about X\n\nReplying to the above"
    expect(bodyMentionsBot(body)).toBe(false)
  })

  it("ignores mentions inside inline backtick spans (e.g. doc references)", () => {
    expect(bodyMentionsBot("The handle is `@openclaw-devops` — see docs")).toBe(false)
  })

  it("does not match email-like prefixes", () => {
    expect(bodyMentionsBot("contact openclaw-devops@example.com")).toBe(false)
  })

  it("does not match a longer handle prefix (e.g. @openclaw-devops-other)", () => {
    expect(bodyMentionsBot("ping @openclaw-devops-other")).toBe(false)
  })

  it("uses configured triggers from env", () => {
    const original = process.env.OPENCLAW_MENTION_TRIGGERS
    process.env.OPENCLAW_MENTION_TRIGGERS = "openclaw-bot-alt"
    try {
      expect(bodyMentionsBot("yo @openclaw-bot-alt please")).toBe(true)
      expect(bodyMentionsBot("yo @openclaw-devops please")).toBe(false)
    } finally {
      if (original == null) delete process.env.OPENCLAW_MENTION_TRIGGERS
      else process.env.OPENCLAW_MENTION_TRIGGERS = original
    }
  })
})

describe("isKnownBotAuthor", () => {
  it("flags coderabbitai variants", () => {
    expect(isKnownBotAuthor("coderabbitai")).toBe(true)
    expect(isKnownBotAuthor("coderabbitai[bot]")).toBe(true)
    expect(isKnownBotAuthor("CodeRabbitAI[bot]")).toBe(true)
  })

  it("flags openclaw-devops itself (don't reply to ourselves)", () => {
    expect(isKnownBotAuthor("openclaw-devops")).toBe(true)
    expect(isKnownBotAuthor("openclaw[bot]")).toBe(true)
  })

  it("flags any [bot] suffix as a generic GitHub App", () => {
    expect(isKnownBotAuthor("custom-thing[bot]")).toBe(true)
  })

  it("does not flag a regular human login", () => {
    expect(isKnownBotAuthor("damartinezjulio")).toBe(false)
  })
})

describe("stripMentionFromBody", () => {
  it("removes the @-mention with surrounding whitespace", () => {
    expect(stripMentionFromBody("@openclaw-devops what about line 42?")).toBe(
      "what about line 42?"
    )
  })

  it("removes a comma-trailed mention", () => {
    expect(stripMentionFromBody("@openclaw-devops, can you check?")).toBe("can you check?")
  })

  it("leaves the rest of the body untouched (collapses trailing whitespace of the mention)", () => {
    const body = "Hey @openclaw-devops — should `foo` be inlined here?"
    expect(stripMentionFromBody(body)).toBe("Hey — should `foo` be inlined here?")
  })
})

describe("stripQuotesAndCode", () => {
  it("removes fenced code blocks", () => {
    const body = "before\n```js\nconst x = 1\n```\nafter"
    expect(stripQuotesAndCode(body)).not.toContain("const x")
    expect(stripQuotesAndCode(body)).toContain("before")
    expect(stripQuotesAndCode(body)).toContain("after")
  })

  it("removes blockquote lines", () => {
    const body = "> quoted\nactual question"
    expect(stripQuotesAndCode(body)).toBe("actual question")
  })

  it("removes inline backtick spans", () => {
    expect(stripQuotesAndCode("see `@openclaw-devops` ref")).toBe("see  ref")
  })
})

describe("parseMentionResponse", () => {
  it("parses a clean answer object", () => {
    const out = parseMentionResponse(
      JSON.stringify({ answer: "Look at `foo.ts:42`.", confidence: 4, abstain: false })
    )
    expect(out).toEqual({ answer: "Look at `foo.ts:42`.", confidence: 4, abstain: false })
  })

  it("strips a ```json fence", () => {
    const text = '```json\n{"answer":"hi","confidence":3,"abstain":false}\n```'
    const out = parseMentionResponse(text)
    expect(out?.answer).toBe("hi")
  })

  it("captures abstain flag when set", () => {
    const out = parseMentionResponse(
      JSON.stringify({ answer: "Need more context.", confidence: 1, abstain: true })
    )
    expect(out?.abstain).toBe(true)
  })

  it("returns null for empty answer", () => {
    expect(parseMentionResponse(JSON.stringify({ answer: "", confidence: 4 }))).toBeNull()
  })

  it("returns null for non-object output", () => {
    expect(parseMentionResponse("[]")).toBeNull()
    expect(parseMentionResponse("not json")).toBeNull()
  })

  it("clamps out-of-range confidence to default 3", () => {
    const out = parseMentionResponse(
      JSON.stringify({ answer: "ok", confidence: 99, abstain: false })
    )
    expect(out?.confidence).toBe(3)
  })
})

describe("formatMentionReply", () => {
  it("includes the marker, asker mention, lobster, and answer body", () => {
    const body = formatMentionReply({
      verdict: { answer: "Look at `foo.ts:42`.", confidence: 4, abstain: false },
      askerLogin: "stevenfojas670",
      sourceCommentId: 12345,
      marker: "<!-- openclaw:mention-reply:",
    })
    expect(body.split("\n")[0]).toBe("<!-- openclaw:mention-reply:12345 -->")
    expect(body).toContain("@stevenfojas670 🦞")
    expect(body).toContain("Look at `foo.ts:42`.")
  })
})
