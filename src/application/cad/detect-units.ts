// Read $INSUNITS from a parsed DXF document and translate it into our
// canonical UnitSystem. Anything we don't explicitly recognise (most
// importantly `0` "unitless" and missing-header DXFs) returns
// undefined, which the Review dialog treats as "operator must pick".
//
// AutoCAD $INSUNITS code reference (subset; full list is the AutoCAD
// header docs):
//   0 = Unitless          → undefined
//   1 = Inches            → "inch"
//   4 = Millimeters       → "mm"
//   2 = Feet, 3 = Miles, 5 = Centimeters, 6 = Meters, ...
//      → undefined (force operator selection rather than a guess)

import type { DxfDocument, UnitSystem } from "./dxf-types"

export function detectUnits(doc: DxfDocument): UnitSystem | undefined {
  switch (doc.insUnits) {
    case 1:
      return "inch"
    case 4:
      return "mm"
    default:
      return undefined
  }
}
