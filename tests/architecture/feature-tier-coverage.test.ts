/**
 * Architectural guard: every Pro/Max FeatureKey in `FEATURE_TIERS`
 * must have at least one enforcement point — either a route gate in
 * `src/middleware/feature-gate.ts` (the proxy-level matcher) OR a
 * `requireFeature(actor, "<key>")` callsite somewhere in the
 * codebase (action-layer gate).
 *
 * Why this test exists:
 *   The marketing pricing page (`rubberfit-marketing/src/app/pricing/page.tsx`)
 *   IS the canonical scope per the founder-locked tier definitions.
 *   When a new feature is added to that page and mirrored into
 *   `FEATURE_TIERS`, this test fails the build unless the matching
 *   gate ships in the same PR. That keeps the "marketing promise =
 *   implemented gate" invariant from drifting silently.
 *
 * Scope:
 *   - Standard-tier keys are exempt (every paying customer has them,
 *     so no gate is needed — the gate exists to deny sub-tier access).
 *   - Enterprise tier bypasses all gates by design (manually
 *     provisioned), so its keys don't appear in FEATURE_TIERS.
 *   - Pro/Max keys MUST be enforced.
 *
 * Allowlist (`PENDING_IMPLEMENTATION`):
 *   Features the marketing page promises but the app doesn't ship yet
 *   (CRM, AI planner, multi-shop, cross-team scheduling). When their
 *   surface lands, drop them from the allowlist in the same PR — the
 *   test then enforces a real gate.
 */
import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import {
  FEATURE_TIERS,
  type FeatureKey,
  type PlanTier,
} from "@/src/application/billing/feature-tiers"

const REPO_ROOT = path.resolve(__dirname, "../..")
const FEATURE_GATE_FILE = path.join(REPO_ROOT, "src/middleware/feature-gate.ts")

const SCAN_DIRS: readonly string[] = ["app", "src", "di", "config", "nesting"]

// Features promised on the marketing page that the app doesn't ship
// yet. Each entry MUST cite the marketing bullet it traces to so the
// next reviewer can drop it from the list the moment the surface
// lands.
//
// Removing an entry is the right call when:
//   1. The app has a route gate for it in `feature-gate.ts`, OR
//   2. The app has a `requireFeature(actor, "<key>")` callsite.
const PENDING_IMPLEMENTATION = new Set<FeatureKey>([
  "full_crm", // "Full CRM (contacts, accounts, pipeline)" — not built
  "ai_planner", // "AI-augmented planner" — not built
  "multi_shop", // "Multi-shop coordination" — not built
  "cross_team_scheduling", // "Cross-team operator scheduling" — not built
])

const TIERS_REQUIRING_ENFORCEMENT: readonly PlanTier[] = ["pro", "max"]

function isEnforced(key: FeatureKey, sourceCorpus: string, featureGateSource: string): boolean {
  // Route gate: the feature-gate.ts file returns `<key>` somewhere.
  // We look for the literal `"<key>"` or `'<key>'` after a `return`
  // keyword to avoid catching unrelated tokens.
  const routeRegex = new RegExp(String.raw`return\s+["']${key}["']`)
  if (routeRegex.test(featureGateSource)) return true

  // Action-layer gate: any source file calls `requireFeature(actor,
  // "<key>")`. The first positional arg is an actor variable name
  // (or any identifier expression), so we allow flexible whitespace
  // but require the literal key string in the second argument.
  const actionRegex = new RegExp(
    String.raw`requireFeature\s*\([^)]*?,\s*["']${key}["']`,
    "s"
  )
  if (actionRegex.test(sourceCorpus)) return true

  return false
}

function isScannableFile(name: string): boolean {
  return name.endsWith(".ts") || name.endsWith(".tsx")
}

function walkSources(dir: string, acc: string[]): void {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch (_err) {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      // Skip generated / vendored trees.
      if (entry.name === "node_modules" || entry.name === ".next") continue
      walkSources(full, acc)
      continue
    }
    if (!entry.isFile() || !isScannableFile(entry.name)) continue
    // Skip the architecture-test file itself so its literal mentions
    // of feature keys (this Set) don't satisfy the enforcement check.
    if (full === __filename) continue
    acc.push(full)
  }
}

function readSourceCorpus(): string {
  const files: string[] = []
  for (const dir of SCAN_DIRS) {
    walkSources(path.join(REPO_ROOT, dir), files)
  }
  return files.map((f) => fs.readFileSync(f, "utf8")).join("\n\n")
}

describe("architecture: feature-tier coverage", () => {
  const sourceCorpus = readSourceCorpus()
  const featureGateSource = fs.readFileSync(FEATURE_GATE_FILE, "utf8")

  const enforceableKeys = (Object.entries(FEATURE_TIERS) as Array<[FeatureKey, PlanTier]>).filter(
    ([, tier]) => TIERS_REQUIRING_ENFORCEMENT.includes(tier)
  )

  it("scans at least one file (sanity)", () => {
    expect(sourceCorpus.length).toBeGreaterThan(1000)
  })

  for (const [key, tier] of enforceableKeys) {
    const isPending = PENDING_IMPLEMENTATION.has(key)

    if (isPending) {
      it(`[allowlisted] ${tier}:${key} — feature surface not yet built`, () => {
        // Pending features are documented but unenforced. When the
        // surface lands, drop the key from PENDING_IMPLEMENTATION
        // and this test flips to require a real gate.
        expect(PENDING_IMPLEMENTATION.has(key)).toBe(true)
      })
      continue
    }

    it(`${tier}:${key} has either a route gate or a requireFeature callsite`, () => {
      const enforced = isEnforced(key, sourceCorpus, featureGateSource)
      expect(
        enforced,
        `No enforcement found for FEATURE_TIERS["${key}"] (${tier}). ` +
          `Add a route gate in src/middleware/feature-gate.ts OR a ` +
          `requireFeature(actor, "${key}") callsite. If the feature ` +
          `surface isn't built yet, add the key to PENDING_IMPLEMENTATION ` +
          `with a one-line citation of the marketing bullet it traces to.`
      ).toBe(true)
    })
  }

  it("PENDING_IMPLEMENTATION contains only Pro/Max keys (no dead entries)", () => {
    for (const key of PENDING_IMPLEMENTATION) {
      const tier = FEATURE_TIERS[key]
      expect(
        TIERS_REQUIRING_ENFORCEMENT.includes(tier),
        `PENDING_IMPLEMENTATION lists ${key} (${tier}). The allowlist ` +
          `only applies to features that REQUIRE enforcement (Pro/Max).`
      ).toBe(true)
    }
  })

  it("PENDING_IMPLEMENTATION entries are not also enforced (no dead allowlist)", () => {
    // If an entry is already enforced, it should be removed from the
    // allowlist. Catches the staleness case where someone adds the
    // gate but forgets to drop the pending marker.
    for (const key of PENDING_IMPLEMENTATION) {
      const enforced = isEnforced(key, sourceCorpus, featureGateSource)
      expect(
        enforced,
        `PENDING_IMPLEMENTATION lists ${key} but enforcement was found ` +
          `in the codebase. Remove the entry from the allowlist.`
      ).toBe(false)
    }
  })
})
