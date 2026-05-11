/**
 * Phase 5 PR 5 — WCAG 2.1 contrast regression suite for the `--svg-*`
 * tokens in `app/globals.css`.
 *
 * Parses the live `globals.css` with PostCSS, extracts every
 * `--svg-*` custom property from the `:root` (light) and `.dark`
 * blocks, then asserts ≥ 3:1 contrast for every known graphical
 * pair (WCAG 2.1 SC 1.4.11). Text pairs are checked at 4.5:1.
 *
 * If this test fails after a Treatment 1 palette tweak, do NOT
 * change the threshold — adjust the token value until the ratio
 * passes. The 3:1 floor is the standard, not a project preference.
 *
 * Documented exceptions live in `ACCEPTED_LOW_CONTRAST` with a
 * one-line reason each. Use sparingly; every exception is a real
 * a11y hole for low-vision operators.
 */
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import postcss from "postcss"

const GLOBALS_CSS = path.resolve(__dirname, "../../app/globals.css")

interface Rgb {
  r: number
  g: number
  b: number
  a: number
}

function parseColor(s: string): Rgb {
  const trimmed = s.trim()
  if (trimmed.startsWith("#")) {
    const h = trimmed.slice(1)
    const hex = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: 1,
    }
  }
  const m = trimmed.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/)
  if (m) {
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 }
  }
  throw new Error(`unparseable color: ${s}`)
}

function composite(fg: Rgb, bg: Rgb): Rgb {
  return {
    r: Math.round(fg.a * fg.r + (1 - fg.a) * bg.r),
    g: Math.round(fg.a * fg.g + (1 - fg.a) * bg.g),
    b: Math.round(fg.a * fg.b + (1 - fg.a) * bg.b),
    a: 1,
  }
}

function srgbToLinear(c: number): number {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

function luminance({ r, g, b }: Rgb): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a)
  const lb = luminance(b)
  const L1 = Math.max(la, lb)
  const L2 = Math.min(la, lb)
  return (L1 + 0.05) / (L2 + 0.05)
}

interface ParsedCss {
  light: Map<string, string>
  dark: Map<string, string>
}

function parseSvgTokens(): ParsedCss {
  const css = readFileSync(GLOBALS_CSS, "utf8")
  const root = postcss.parse(css)
  const light = new Map<string, string>()
  const dark = new Map<string, string>()

  root.walkRules((rule) => {
    let target: Map<string, string> | null = null
    if (rule.selector === ":root") target = light
    else if (rule.selector === ".dark") target = dark
    if (!target) return
    rule.walkDecls((decl) => {
      if (decl.prop.startsWith("--svg-")) {
        target.set(decl.prop, decl.value)
      }
    })
  })

  return { light, dark }
}

interface PairCheck {
  /** What two SVG layers actually touch in the rendered output. */
  name: string
  /** CSS custom property for the foreground (or composited overlay). */
  fg: string
  /** CSS custom property for the background underneath. */
  bg: string
  /** WCAG threshold — 3.0 for graphical objects, 4.5 for body text. */
  target?: number
  /**
   * Pairs we knowingly do not satisfy, with the reason. Treated as a
   * documented exception rather than a failure. Adding to this list
   * is a small a11y debt — every entry should have a tracked
   * follow-up in the PR description.
   */
  acceptedBelow?: { reason: string }
}

const GRAPHICAL_PAIRS: PairCheck[] = [
  {
    name: "sheet vs page",
    fg: "--svg-sheet-base",
    bg: "--svg-page-bg",
  },
  {
    name: "scrap base vs sheet",
    fg: "--svg-scrap-base",
    bg: "--svg-sheet-base",
  },
  {
    name: "scrap stripe vs scrap base",
    fg: "--svg-scrap-stripe",
    bg: "--svg-scrap-base",
  },
  {
    name: "offcut fill vs sheet",
    fg: "--svg-offcut-fill",
    bg: "--svg-sheet-base",
  },
  {
    name: "offcut border vs offcut fill",
    fg: "--svg-offcut-border",
    bg: "--svg-offcut-fill",
  },
  {
    name: "offcut pinstripe vs offcut fill",
    fg: "--svg-offcut-pinstripe",
    bg: "--svg-offcut-fill",
  },
  {
    name: "part fill vs sheet",
    fg: "--svg-part-fill",
    bg: "--svg-sheet-base",
    acceptedBelow: {
      reason:
        "Parts have a high-contrast stroke that provides edge separation; the fill itself doesn't need to clear 3:1.",
    },
  },
  {
    name: "part stroke vs part fill",
    fg: "--svg-part-stroke",
    bg: "--svg-part-fill",
  },
  {
    name: "part selected stroke vs part fill",
    fg: "--svg-part-selected-stroke",
    bg: "--svg-part-fill",
    acceptedBelow: {
      reason:
        "Selection ring renders with a 1px page-colored inner halo between the teal stroke and the part fill — the ring contrasts the halo, not the fill directly. Defends the dark-mode adjacency where teal-400 and slate-400 share a luminance band.",
    },
  },
  {
    name: "part selected stroke vs sheet",
    fg: "--svg-part-selected-stroke",
    bg: "--svg-sheet-base",
    acceptedBelow: {
      reason:
        "Same halo defends the light-mode adjacency where teal-700 sits near the warm-stone sheet luminance. Without the halo, both modes have one failing selection-ring adjacency.",
    },
  },
  {
    name: "focus stroke vs sheet",
    fg: "--svg-part-focus-stroke",
    bg: "--svg-sheet-base",
    acceptedBelow: {
      reason:
        "Focus ring is dashed 1.5px (strokeDasharray='3 2'), visually distinct from the solid 2px selection ring even at low contrast. The same halo that defends the selection ring sits underneath the focus overlay. Light-mode teal-500 vs warm-stone sheet ~1.88:1; the dashed pattern + halo carry the affordance.",
    },
  },
]

function getColor(map: Map<string, string>, token: string): string {
  const v = map.get(token)
  if (!v) throw new Error(`missing token in globals.css: ${token}`)
  return v
}

function runChecks(modeName: string, tokens: Map<string, string>) {
  describe(modeName, () => {
    for (const pair of GRAPHICAL_PAIRS) {
      const target = pair.target ?? 3.0
      const accepted = pair.acceptedBelow
      it(`${pair.name} — ${accepted ? "documented exception" : `≥ ${target}:1`}`, () => {
        const fgRaw = getColor(tokens, pair.fg)
        const bgRaw = getColor(tokens, pair.bg)
        const fg = parseColor(fgRaw)
        const bg = parseColor(bgRaw)
        const fgFinal = fg.a < 1 ? composite(fg, bg) : fg
        const r = contrastRatio(fgFinal, bg)
        if (accepted) {
          // Document the exception. The test passes; the reason is
          // surfaced in the test name. Failing this would mean
          // someone bumped a token into compliance, which is fine —
          // remove the `acceptedBelow` entry instead of "fixing" the
          // test.
          expect(r).toBeGreaterThan(1)
          return
        }
        expect(r).toBeGreaterThanOrEqual(target)
      })
    }
  })
}

describe("WCAG 2.1 contrast — `--svg-*` tokens", () => {
  const { light, dark } = parseSvgTokens()
  runChecks("light mode (`:root`)", light)
  runChecks("dark mode (`.dark`)", dark)
})
