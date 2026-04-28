/**
 * Unit tests for the multi-repo poller's pure decision helpers. The
 * gh API calls + child-process spawning aren't exercised here — this
 * suite just pins the "should we run CI/CR/issue triage / overview on
 * this PR right now?" logic so future changes to state shape don't
 * silently break idempotency, and the per-repo namespacing keeps two
 * repos with the same issue number from interfering.
 */
import { describe, expect, it } from "vitest"

import {
  shouldRunCiTriage,
  shouldRunCrTriage,
  shouldRunIssueTriage,
  shouldRunPrOverview,
} from "@/tools/openclaw/triage-poll.mjs"

const REPO_A = "Arc-and-Anchor/rema-portal"
const REPO_B = "Arc-and-Anchor/Rubberfit-Desktop"

interface State {
  handledRuns: Record<string, string>
  handledCrComments: Record<string, number>
  handledIssues: Record<string, true>
  handledOverviewShas: Record<string, string>
}

function emptyState(): State {
  return { handledRuns: {}, handledCrComments: {}, handledIssues: {}, handledOverviewShas: {} }
}

describe("shouldRunCiTriage", () => {
  it("returns false when the PR has no failed run", () => {
    expect(
      shouldRunCiTriage({ number: 1, latestFailedRunId: null }, emptyState(), REPO_A)
    ).toBe(false)
  })

  it("returns true when the PR has a failed run we haven't seen before", () => {
    expect(
      shouldRunCiTriage({ number: 1, latestFailedRunId: "12345" }, emptyState(), REPO_A)
    ).toBe(true)
  })

  it("returns false when the failed run id matches the recorded handled id", () => {
    const state = { ...emptyState(), handledRuns: { [`${REPO_A}:1`]: "12345" } }
    expect(shouldRunCiTriage({ number: 1, latestFailedRunId: "12345" }, state, REPO_A)).toBe(
      false
    )
  })

  it("returns true when the failed run id has changed (re-run failed again)", () => {
    const state = { ...emptyState(), handledRuns: { [`${REPO_A}:1`]: "12345" } }
    expect(shouldRunCiTriage({ number: 1, latestFailedRunId: "67890" }, state, REPO_A)).toBe(true)
  })

  it("treats the same PR number in different repos independently", () => {
    const state = { ...emptyState(), handledRuns: { [`${REPO_A}:1`]: "12345" } }
    expect(shouldRunCiTriage({ number: 1, latestFailedRunId: "12345" }, state, REPO_A)).toBe(
      false
    )
    expect(shouldRunCiTriage({ number: 1, latestFailedRunId: "12345" }, state, REPO_B)).toBe(true)
  })
})

describe("shouldRunCrTriage", () => {
  it("returns false when there are no CR comments on the PR", () => {
    expect(shouldRunCrTriage({ number: 1 }, null, emptyState(), REPO_A)).toBe(false)
  })

  it("returns true the first time CR posts on a PR", () => {
    expect(shouldRunCrTriage({ number: 1 }, 100, emptyState(), REPO_A)).toBe(true)
  })

  it("returns false when the latest CR id is unchanged from last pass", () => {
    const state = { ...emptyState(), handledCrComments: { [`${REPO_A}:1`]: 100 } }
    expect(shouldRunCrTriage({ number: 1 }, 100, state, REPO_A)).toBe(false)
  })

  it("returns true when CR has posted a newer comment since last pass", () => {
    const state = { ...emptyState(), handledCrComments: { [`${REPO_A}:1`]: 100 } }
    expect(shouldRunCrTriage({ number: 1 }, 150, state, REPO_A)).toBe(true)
  })

  it("treats different PRs independently within the same repo", () => {
    const state = {
      ...emptyState(),
      handledCrComments: { [`${REPO_A}:1`]: 100, [`${REPO_A}:2`]: 50 },
    }
    expect(shouldRunCrTriage({ number: 1 }, 100, state, REPO_A)).toBe(false)
    expect(shouldRunCrTriage({ number: 2 }, 75, state, REPO_A)).toBe(true)
    expect(shouldRunCrTriage({ number: 3 }, 1, state, REPO_A)).toBe(true)
  })

  it("treats the same PR number in different repos independently", () => {
    const state = { ...emptyState(), handledCrComments: { [`${REPO_A}:1`]: 100 } }
    expect(shouldRunCrTriage({ number: 1 }, 100, state, REPO_A)).toBe(false)
    expect(shouldRunCrTriage({ number: 1 }, 50, state, REPO_B)).toBe(true)
  })
})

describe("shouldRunIssueTriage", () => {
  it("returns true the first time we see an issue", () => {
    expect(shouldRunIssueTriage({ number: 128 }, emptyState(), REPO_A)).toBe(true)
  })

  it("returns false once an issue is in the handled set", () => {
    const state = { ...emptyState(), handledIssues: { [`${REPO_A}:128`]: true as const } }
    expect(shouldRunIssueTriage({ number: 128 }, state, REPO_A)).toBe(false)
  })

  it("treats different issues independently", () => {
    const state = { ...emptyState(), handledIssues: { [`${REPO_A}:128`]: true as const } }
    expect(shouldRunIssueTriage({ number: 128 }, state, REPO_A)).toBe(false)
    expect(shouldRunIssueTriage({ number: 129 }, state, REPO_A)).toBe(true)
  })

  it("treats the same issue number across repos independently", () => {
    const state = { ...emptyState(), handledIssues: { [`${REPO_A}:27`]: true as const } }
    expect(shouldRunIssueTriage({ number: 27 }, state, REPO_A)).toBe(false)
    expect(shouldRunIssueTriage({ number: 27 }, state, REPO_B)).toBe(true)
  })

  it("returns false for malformed input", () => {
    expect(
      shouldRunIssueTriage(null as unknown as { number: number }, emptyState(), REPO_A)
    ).toBe(false)
    expect(
      shouldRunIssueTriage(
        { number: undefined } as unknown as { number: number },
        emptyState(),
        REPO_A
      )
    ).toBe(false)
  })
})

describe("shouldRunPrOverview", () => {
  it("returns true the first time we see a PR head sha", () => {
    expect(
      shouldRunPrOverview({ number: 5, headSha: "abc1234" }, emptyState(), REPO_A)
    ).toBe(true)
  })

  it("returns false when head sha matches the handled sha", () => {
    const state = { ...emptyState(), handledOverviewShas: { [`${REPO_A}:5`]: "abc1234" } }
    expect(shouldRunPrOverview({ number: 5, headSha: "abc1234" }, state, REPO_A)).toBe(false)
  })

  it("returns true after a new push (sha changed)", () => {
    const state = { ...emptyState(), handledOverviewShas: { [`${REPO_A}:5`]: "abc1234" } }
    expect(shouldRunPrOverview({ number: 5, headSha: "deadbeef" }, state, REPO_A)).toBe(true)
  })

  it("treats the same PR number in different repos independently", () => {
    const state = { ...emptyState(), handledOverviewShas: { [`${REPO_A}:5`]: "abc1234" } }
    expect(shouldRunPrOverview({ number: 5, headSha: "abc1234" }, state, REPO_A)).toBe(false)
    expect(shouldRunPrOverview({ number: 5, headSha: "abc1234" }, state, REPO_B)).toBe(true)
  })
})
