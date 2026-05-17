// app/dashboard/cutting-engine/_components/gasket-examples.ts
//
// Real-industry gasket presets sourced from public flange standards
// (ANSI B16.5 / B16.21 raised-face, ANSI B16.5 class 300, DIN 2632
// PN10, generic manhole proportions). The dimensions themselves are
// public reference data published in every major manufacturer
// catalog (Garlock, Klinger, Topog-E, Lamons) and the relevant ASME
// standard summaries — we're using them to seed example renderings
// only, not redistributing the ASME/DIN spec text.
//
// Each preset bundles a GasketSpec (the same shape the parametric
// tabs build) with a small bit of operator-facing metadata (name,
// standard ref, one-line description) so the Examples tab can show
// a card per preset without re-deriving the labels.

import type { GasketSpec } from "./gasket-template"

export interface GasketExample {
  /** Stable id for React keys + telemetry. */
  id: string
  /** Display name for the preset card title. */
  name: string
  /** Standard reference (e.g. "ANSI B16.21 Class 150"). */
  standard: string
  /** Short prose description shown under the title. */
  description: string
  /** Spec the existing parametric pipeline already knows how to build. */
  spec: GasketSpec
}

// Common ANSI B16.5 class 150 raised-face flange dimensions for
// matching B16.21 non-asbestos full-face gaskets:
//   - 4″ pipe: flange OD 9.000″, BCD 7.500″, 8 bolts × 0.750″, bore 4.500″
//   - 6″ pipe: flange OD 11.000″, BCD 9.500″, 8 bolts × 0.875″, bore 6.625″
//   - 8″ pipe: flange OD 13.500″, BCD 11.750″, 8 bolts × 0.875″, bore 8.625″
// ANSI B16.21 ring-gasket dimensions for same flanges (no bolt holes):
//   - 4″ pipe: OD 6.875″, ID 4.500″
//   - 6″ pipe: OD 8.750″, ID 6.625″
// DIN 2632 PN10 DN100 flange dimensions:
//   - OD 220 mm ≈ 8.661″, bore 115 mm ≈ 4.528″, BCD 180 mm ≈ 7.087″,
//     8 bolts × 18 mm ≈ 0.709″

export const GASKET_EXAMPLES: GasketExample[] = [
  {
    id: "ansi-150-4in-ring",
    name: 'ANSI 150# 4" Ring',
    standard: "ANSI B16.21 Class 150",
    description: "Pipe-flange ring gasket. Most common rubber-sheet cut.",
    spec: {
      kind: "ring",
      outerDiameter: 6.875,
      innerDiameter: 4.5,
    },
  },
  {
    id: "ansi-150-6in-ring",
    name: 'ANSI 150# 6" Ring',
    standard: "ANSI B16.21 Class 150",
    description: "Larger raised-face ring; check chord-deviation tessellation.",
    spec: {
      kind: "ring",
      outerDiameter: 8.75,
      innerDiameter: 6.625,
    },
  },
  {
    id: "ansi-150-4in-full-face",
    name: 'ANSI 150# 4" Full-face',
    standard: "ANSI B16.5 Class 150",
    description: "Flat-face flange gasket — 8 bolts, 0.75″ holes.",
    spec: {
      kind: "full-face",
      outerDiameter: 9.0,
      boreInnerDiameter: 4.5,
      boltCircleDiameter: 7.5,
      boltCount: 8,
      boltHoleDiameter: 0.75,
    },
  },
  {
    id: "ansi-150-8in-full-face",
    name: 'ANSI 150# 8" Full-face',
    standard: "ANSI B16.5 Class 150",
    description: "Large full-face — exercises bigger waste regions on a 4×8 sheet.",
    spec: {
      kind: "full-face",
      outerDiameter: 13.5,
      boreInnerDiameter: 8.625,
      boltCircleDiameter: 11.75,
      boltCount: 8,
      boltHoleDiameter: 0.875,
    },
  },
  {
    id: "din-2632-pn10-dn100",
    name: "DIN 2632 PN10 DN100",
    standard: "DIN 2632 PN10",
    description: "Metric full-face flange — 8 bolts on a 180 mm bolt circle.",
    spec: {
      kind: "full-face",
      outerDiameter: 8.661,
      boreInnerDiameter: 4.528,
      boltCircleDiameter: 7.087,
      boltCount: 8,
      boltHoleDiameter: 0.709,
    },
  },
  {
    id: "manhole-obround-24x18",
    name: 'Manhole 24" × 18"',
    standard: "Tank manhole (generic)",
    description: "Obround pressure-vessel manhole gasket — fully fills 4×8 narrow side.",
    spec: {
      kind: "obround",
      length: 24,
      width: 18,
    },
  },
]
