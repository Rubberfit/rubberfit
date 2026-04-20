// Generate sample-parts.xlsx with 100 entries per shape family.
// All sizes fit within a 96x48 stock sheet.

import * as XLSX from "xlsx"
import { writeFileSync } from "node:fs"

// Deterministic pseudo-random so re-runs produce the same file.
function mulberry32(seed) {
  let t = seed
  return () => {
    t |= 0
    t = (t + 0x6d2b79f5) | 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(42)
const pick = (arr) => arr[Math.floor(rand() * arr.length)]
const randRange = (min, max) => min + Math.floor(rand() * (max - min + 1))

// ── Rectangles ──────────────────────────────────────────────────────────────
// Varied sizes to stress the guillotine packer. All fit on 96x48.
const rectWidths = [3, 4, 6, 8, 10, 11.5, 12, 14, 16, 18, 20, 22, 24, 28, 30, 36]
const rectLengths = [4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 30, 36, 40, 48, 56, 64, 72, 84, 92]

const rectangles = Array.from({ length: 100 }, (_, i) => {
  let w = pick(rectWidths)
  let l = pick(rectLengths)
  // Keep the longer side ≤ 96 and shorter side ≤ 48 so it fits on stock.
  if (w > l) [w, l] = [l, w]
  if (l > 92) l = 92
  if (w > 44) w = 44
  const qty = rand() < 0.15 ? randRange(2, 4) : 1
  return {
    "Part Number": `G${i + 1}`,
    Width: w,
    Length: l,
    Quantity: qty,
  }
})

// ── Cylinders ───────────────────────────────────────────────────────────────
// circumference = π × diameter. Keep circumference ≤ 92 → diameter ≤ ~29.
// Height ≤ 48.
const cylDiameters = [6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28]
const cylHeights = [6, 8, 10, 12, 14, 16, 18, 20, 24, 30, 36, 42, 48]

const cylinders = Array.from({ length: 100 }, (_, i) => ({
  "Part Number": `C${i + 1}`,
  Diameter: pick(cylDiameters),
  Height: pick(cylHeights),
  Quantity: rand() < 0.15 ? randRange(2, 4) : 1,
}))

// ── Cones ───────────────────────────────────────────────────────────────────
// For an annular sector, the bounding box width ≈ 2·outerR·sin(arc/2) when
// arc ≤ 180°, else 2·outerR. Keep outerR ≤ 24 so the worst case (180° arc)
// at 48" bounding fits on the narrow axis of the stock.
const arcDegrees = [60, 75, 90, 100, 120, 130, 150, 180]

const cones = Array.from({ length: 100 }, (_, i) => {
  const innerR = randRange(4, 14)
  const outerR = innerR + randRange(4, 12)
  return {
    "Part Number": `CN${i + 1}`,
    "Inner Radius": innerR,
    "Outer Radius": Math.min(outerR, 24),
    "Arc Degrees": pick(arcDegrees),
    Quantity: rand() < 0.15 ? randRange(2, 4) : 1,
  }
})

// ── Trapezoids ──────────────────────────────────────────────────────────────
// Bounding box is max(topWidth, bottomWidth) × height. Keep bounding ≤ 44×92.
const trapTops = [6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 44]
const trapHeights = [8, 10, 12, 16, 20, 24, 30, 36, 42, 48, 56, 64, 72, 84, 92]

const trapezoids = Array.from({ length: 100 }, (_, i) => {
  const top = pick(trapTops)
  // Bottom differs from top by 2–18, but capped so max(top, bottom) ≤ 44.
  const delta = randRange(-18, 18) || 4
  let bottom = top + delta
  if (bottom < 4) bottom = 4
  if (bottom > 44) bottom = 44
  return {
    "Part Number": `T${i + 1}`,
    "Top Width": top,
    "Bottom Width": bottom,
    Height: pick(trapHeights),
    Quantity: rand() < 0.15 ? randRange(2, 4) : 1,
  }
})

// ── Build workbook ──────────────────────────────────────────────────────────
const wb = XLSX.utils.book_new()

XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.json_to_sheet(rectangles, {
    header: ["Part Number", "Width", "Length", "Quantity"],
  }),
  "Rectangles"
)

XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.json_to_sheet(cylinders, {
    header: ["Part Number", "Diameter", "Height", "Quantity"],
  }),
  "Cylinders"
)

XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.json_to_sheet(cones, {
    header: ["Part Number", "Inner Radius", "Outer Radius", "Arc Degrees", "Quantity"],
  }),
  "Cones"
)

XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.json_to_sheet(trapezoids, {
    header: ["Part Number", "Top Width", "Bottom Width", "Height", "Quantity"],
  }),
  "Trapezoids"
)

const out = "sample-parts.xlsx"
const buffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" })
writeFileSync(out, buffer)
console.log(`Wrote ${out} — ${rectangles.length + cylinders.length + cones.length + trapezoids.length} rows across 4 sheets`)
