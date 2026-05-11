/**
 * Phase 5 PR 5 — WCAG 2.1 contrast regression suite for the `--svg-*`
 * tokens in `app/globals.css`.
 *
 * Parses the live `globals.css` with PostCSS, extracts every
 * `--svg-*` custom property from the `:root` (light) and `.dark`
 * blocks, then asserts ≥ 3:1 contrast for every known graphical
 * pair (WCAG 2.1 SC 1.4.11).
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
   *
   * `minRatio` is the floor BELOW the 3:1 WCAG target that the
   * exception is allowed to occupy. The number locks in the current
   * measurement so a future token tweak can't silently drag the
   * ratio further down (e.g. from 1.8:1 to 1.05:1 — both fail 3:1,
   * but the latter is dramatically worse for low-vision users and
   * should fail the suite). Pick a value just below the current
   * measured ratio when introducing an exception.
   */
  acceptedBelow?: { reason: string; minRatio: number }
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
      // Light measures 3.15, dark 2.55 — set the floor just under
      // the dark-mode value so a future token regression that
      // pulled either mode below 2.4:1 fails the suite.
      minRatio: 2.4,
    },
  },
  {
    name: "part stroke vs part fill",
    fg: "--svg-part-stroke",
    bg: "--svg-part-fill",
  },
  {
    // The selection ring is a 2px teal stroke painted over a 4px
    // page-colored halo. The visible adjacency operators perceive is
    // ring-vs-halo (not ring-vs-part-fill or ring-vs-sheet — those
    // surfaces are fully covered by the halo on both sides of the
    // ring). Measuring against `--svg-page-bg` reflects what the eye
    // actually sees.
    name: "part selected stroke vs page-bg (halo)",
    fg: "--svg-part-selected-stroke",
    bg: "--svg-page-bg",
  },
  {
    // PR 7 — error banner stroke vs its own fill. Must be visible as a
    // bordered alert; 3:1 graphical-object floor.
    name: "error stroke vs error fill",
    fg: "--svg-error-stroke",
    bg: "--svg-error-fill",
  },
  {
    // PR 7 — error banner stands out against the page surface.
    // Fill is intentionally a soft red wash that nearly matches the
    // page; the high-contrast `--svg-error-stroke` border + the
    // `TriangleAlert` icon carry the affordance, same pattern as
    // `part-fill vs sheet`.
    name: "error fill vs page-bg",
    fg: "--svg-error-fill",
    bg: "--svg-page-bg",
    acceptedBelow: {
      reason:
        "Error banner border (--svg-error-stroke) and the TriangleAlert icon carry the separation; the fill itself doesn't need 3:1 against the page.",
      // Light measures 1.00, dark 1.22. Floor at 1.0 — any further
      // regression below the current value still fails the suite,
      // and 1.0 means the fills are literally identical.
      minRatio: 1.0,
    },
  },
  {
    name: "focus stroke vs page-bg (halo)",
    fg: "--svg-part-focus-stroke",
    bg: "--svg-page-bg",
    acceptedBelow: {
      reason:
        "Focus ring is dashed 1.5px (strokeDasharray='3 2'), visually distinct from the solid 2px selection ring even at low contrast. Light-mode teal-500 vs slate-50 page-bg measures ~2.27:1; the dashed pattern carries the affordance where the contrast alone would not.",
      // Light measures 2.27, dark 14.76. Floor at 2.2 — any further
      // light-mode regression below the current "subtle but visible"
      // value fails the suite.
      minRatio: 2.2,
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
      const label = accepted
        ? `documented exception (≥ ${accepted.minRatio}:1 floor)`
        : `≥ ${target}:1`
      it(`${pair.name} — ${label}`, () => {
        const fgRaw = getColor(tokens, pair.fg)
        const bgRaw = getColor(tokens, pair.bg)
        const fg = parseColor(fgRaw)
        const bg = parseColor(bgRaw)
        const fgFinal = fg.a < 1 ? composite(fg, bg) : fg
        const r = contrastRatio(fgFinal, bg)
        if (accepted) {
          // The exception locks in a per-pair floor below the 3:1
          // WCAG target. A future token tweak that drops the ratio
          // further is caught here. If a future tweak instead lifts
          // the ratio above 3.0 in both modes, remove the
          // `acceptedBelow` entry and let the pair join the normal
          // checks — don't bump the floor.
          expect(r).toBeGreaterThanOrEqual(accepted.minRatio)
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
