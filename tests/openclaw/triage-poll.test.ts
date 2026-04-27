/**
 * Unit tests for the dual-trigger poller's pure decision helpers. The
 * gh API calls + child-process spawning aren't exercised here — this
 * suite just pins the "should we run CI/CR triage on this PR right
 * now?" logic so future changes to state shape don't silently break
 * idempotency.
 */
import { describe, expect, it } from "vitest"

import { shouldRunCiTriage, shouldRunCrTriage } from "@/tools/openclaw/triage-poll.mjs"

interface State {
  handledRuns: Record<string, string>
  handledCrComments: Record<string, number>
}

function emptyState(): State {
  return { handledRuns: {}, handledCrComments: {} }
}

describe("shouldRunCiTriage", () => {
  it("returns false when the PR has no failed run", () => {
    expect(shouldRunCiTriage({ number: 1, latestFailedRunId: null }, emptyState())).toBe(false)
  })

  it("returns true when the PR has a failed run we haven't seen before", () => {
    expect(shouldRunCiTriage({ number: 1, latestFailedRunId: "12345" }, emptyState())).toBe(true)
  })

  it("returns false when the failed run id matches the recorded handled id", () => {
    const state = { handledRuns: { "1": "12345" }, handledCrComments: {} }
    expect(shouldRunCiTriage({ number: 1, latestFailedRunId: "12345" }, state)).toBe(false)
  })

  it("returns true when the failed run id has changed (re-run failed again)", () => {
    const state = { handledRuns: { "1": "12345" }, handledCrComments: {} }
    expect(shouldRunCiTriage({ number: 1, latestFailedRunId: "67890" }, state)).toBe(true)
  })
})

describe("shouldRunCrTriage", () => {
  it("returns false when there are no CR comments on the PR", () => {
    expect(shouldRunCrTriage({ number: 1 }, null, emptyState())).toBe(false)
  })

  it("returns true the first time CR posts on a PR", () => {
    expect(shouldRunCrTriage({ number: 1 }, 100, emptyState())).toBe(true)
  })

  it("returns false when the latest CR id is unchanged from last pass", () => {
    const state = { handledRuns: {}, handledCrComments: { "1": 100 } }
    expect(shouldRunCrTriage({ number: 1 }, 100, state)).toBe(false)
  })

  it("returns true when CR has posted a newer comment since last pass", () => {
    const state = { handledRuns: {}, handledCrComments: { "1": 100 } }
    expect(shouldRunCrTriage({ number: 1 }, 150, state)).toBe(true)
  })

  it("returns false when latest CR id is older than handled (shouldn't happen, but defensive)", () => {
    const state = { handledRuns: {}, handledCrComments: { "1": 200 } }
    expect(shouldRunCrTriage({ number: 1 }, 150, state)).toBe(false)
  })

  it("treats different PRs independently", () => {
    const state = { handledRuns: {}, handledCrComments: { "1": 100, "2": 50 } }
    expect(shouldRunCrTriage({ number: 1 }, 100, state)).toBe(false)
    expect(shouldRunCrTriage({ number: 2 }, 75, state)).toBe(true)
    expect(shouldRunCrTriage({ number: 3 }, 1, state)).toBe(true)
  })
})
