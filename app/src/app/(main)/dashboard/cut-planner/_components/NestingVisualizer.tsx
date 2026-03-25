"use client";

import React, { useState, useRef, useEffect, useCallback, useId, useMemo } from "react";
import { Scissors } from "lucide-react";
import { NFPSolver } from "@/lib/nesting/nfp-solver";
import { rectToPolygon, circleToPolygon, trapezoidToPolygon, sectorToPolygon } from "@/lib/nesting/shape-to-polygon";
import type { NestingInput, NestingPart, NestingResult } from "@/lib/nesting/types";

// Types 
type ShapeType   = "rect" | "circle" | "cone";
type GrainDir    = "none" | "width" | "length";
type DiagDir     = "ltr" | "rtl";
type StratMethod = "rect" | "diag";
export type SimplePartType = "rectangle" | "circle" | "cylinder" | "cone" | "trapezoid";
export type SimpleCutDirection =
  | "vertical_split"
  | "horizontal_split"
  | "radial_split"
  | "arc_bands"
  | "wrap_panels"
  | "wrap_bands";

interface SimplePartSpec {
  partType: SimplePartType;
  quantity: number;
  cutDirection?: SimpleCutDirection;
  cutRatios?: number[];
  width?: number;
  length?: number;
  diameter?: number;
  height?: number;
  topWidth?: number;
  bottomWidth?: number;
  innerRadius?: number;
  outerRadius?: number;
  arcDegrees?: number;
}

interface Strategy {
  id:          string;
  name:        string;
  sub:         string;
  method:      StratMethod;
  cutW:        number;
  cutH:        number;
  primaryDir:  "horizontal" | "vertical";
  diagType?:   "corner" | "custom";
  diagAngle?:  number;
  ddir?:       DiagDir;
  steps:       string[];
  icon:        string;
}

interface ScoredStrategy extends Strategy {
  cols:    number;
  rows:    number;
  rects:   number;
  pieces:  number;
  waste:   number;
  vCuts:   number;
  hCuts:   number;
  score:   number;
  reasons: { p: "p" | "w" | "f"; t: string }[];
}

interface NestingVisualizerProps {
  defaultRollWidth?:  number;
  defaultRollLength?: number;
  defaultCutWidth?:   number;
  defaultCutHeight?:  number;
  defaultQty?:        number;
  simpleMode?:        boolean;
  simplePart?: SimplePartSpec;
  simpleParts?: SimplePartSpec[];
}

// SVG helpers 
const NS = "http://www.w3.org/2000/svg";

function se(tag: string, attrs: Record<string, string | number> = {}, parent?: Element) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (parent) parent.appendChild(e);
  return e;
}
function st(txt: string, attrs: Record<string, string | number> = {}, parent?: Element) {
  const e = se("text", {
    "font-size": "9", "font-family": "'DM Mono',monospace", fill: "#64748b", ...attrs,
  }, parent);
  e.textContent = txt;
  return e;
}

// Layout / scoring helpers 
function calcLayout(rollW: number, rollL: number, cw: number, ch: number) {
  const cols  = Math.floor(rollW / cw);
  const rows  = Math.floor(rollL / ch);
  const rects = cols * rows;
  const waste = rollW * rollL > 0 ? (1 - (rects * cw * ch) / (rollW * rollL)) * 100 : 100;
  return { cols, rows, rects, waste, vCuts: cols - 1, hCuts: rows - 1 };
}

function scoreStrat(
  s: Strategy, rollW: number, rollL: number, qty: number, grain: GrainDir
): ScoredStrategy {
  const L      = calcLayout(rollW, rollL, s.cutW, s.cutH);
  const pieces = s.method === "diag" ? L.rects * 2 : L.rects;
  let score    = 100;
  const reasons: { p: "p" | "w" | "f"; t: string }[] = [];

  // grain
  if (grain === "width" && s.cutH > s.cutW)       { score -= 45; reasons.push({ p: "f", t: "Grain conflict — crosses roll width grain." }); }
  else if (grain === "length" && s.cutW > s.cutH) { score -= 45; reasons.push({ p: "f", t: "Grain conflict — crosses roll length grain." }); }
  else if (grain !== "none")                        reasons.push({ p: "p", t: "Grain direction preserved." });

  // waste
  score += Math.max(0, 30 - L.waste);
  if (L.waste < 5)       reasons.push({ p: "p", t: `${L.waste.toFixed(1)}% edge waste — excellent yield.` });
  else if (L.waste < 20) reasons.push({ p: "p", t: `${L.waste.toFixed(1)}% edge waste — good.` });
  else                   reasons.push({ p: "w", t: `${L.waste.toFixed(1)}% edge waste — consider resizing.` });

  // feed
  if (s.primaryDir === "horizontal") { score += 12; reasons.push({ p: "p", t: "Primary cuts run parallel to roll feed — easier." }); }
  else                                reasons.push({ p: "w", t: "Primary cuts run across the roll width." });

  // diagonal bonus
  if (s.method === "diag") {
    score += 8;
    reasons.push({ p: "p", t: "Diagonal yields 2× pieces per rect — both triangles kept." });
    if (s.diagType === "corner") {
      const a = Math.atan2(s.cutH, s.cutW) * (180 / Math.PI);
      if (Math.abs(a - 45) < 5) reasons.push({ p: "p", t: `${a.toFixed(1)}° — equal right triangles.` });
      else                       reasons.push({ p: "w", t: `${a.toFixed(1)}° — unequal triangles, label A & B.` });
    }
  }

  // qty
  if (pieces < qty) { score -= 30; reasons.push({ p: "f", t: `${pieces} pieces < ${qty} needed — second roll required.` }); }
  else               reasons.push({ p: "p", t: `${pieces} pieces — meets qty of ${qty}.` });

  return {
    ...s, ...L, pieces,
    score: Math.max(0, Math.min(100, score)),
    reasons,
  };
}

function getStrategies(cw: number, ch: number, ang: number, ddir: DiagDir): Strategy[] {
  return [
    { id: "rows-first",  name: "Horizontal strips",  sub: "H-cuts first (←→), then V-cuts (↕)",   method: "rect", cutW: cw, cutH: ch, primaryDir: "horizontal", icon: "H",  steps: ["Full roll", "H-cuts first", "V-cuts next",   "Done"] },
    { id: "cols-first",  name: "Vertical strips",    sub: "V-cuts first (↕), then H-cuts (←→)",   method: "rect", cutW: cw, cutH: ch, primaryDir: "vertical",   icon: "V",  steps: ["Full roll", "V-cuts first", "H-cuts next",   "Done"] },
    { id: "landscape",   name: "Rotated 90°",        sub: `Piece turned — ${ch}"×${cw}" on roll`,  method: "rect", cutW: ch, cutH: cw, primaryDir: "horizontal", icon: "R",  steps: ["Full roll", "H-cuts first", "V-cuts next",   "Done"] },
    { id: "diag-corner", name: "Corner diagonal",    sub: `${Math.round(Math.atan2(ch, cw) * 180 / Math.PI)}° corner-to-corner`, method: "diag", cutW: cw, cutH: ch, primaryDir: "horizontal", diagType: "corner", ddir, icon: "╱", steps: ["Full roll", "Straight cuts", "Diagonal cuts", "Done"] },
    { id: "diag-custom", name: `Custom ${ang}° diag`, sub: `${ddir === "ltr" ? "╱ left-to-right" : "╲ right-to-left"} at ${ang}°`, method: "diag", cutW: cw, cutH: ch, primaryDir: "horizontal", diagType: "custom", diagAngle: ang, ddir, icon: "∠", steps: ["Full roll", "Straight cuts", "Diagonal cuts", "Done"] },
    { id: "diag-land",   name: "Rotated + diagonal", sub: "90° rotation then diagonal split",      method: "diag", cutW: ch, cutH: cw, primaryDir: "horizontal", diagType: "corner", ddir, icon: "╲", steps: ["Full roll", "Straight cuts", "Diagonal cuts", "Done"] },
  ];
}

interface SimpleRectLayout {
  orientation: "default" | "rotated";
  pieceW: number;
  pieceH: number;
  cols: number;
  rows: number;
  rowCounts: number[];
  capacity: number;
  placed: number;
  overflow: number;
  usedArea: number;
  wasteArea: number;
  wastePct: number;
  reusableArea: number;
  scrapArea: number;
  reusablePieces: number;
}

interface SimpleCircleLayout {
  positions: ShapePlacement[];
  blankSize: number;
  capacity: number;
  placed: number;
  overflow: number;
  usedArea: number;
  wasteArea: number;
  wastePct: number;
}

function formatInches(value: number) {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d*[1-9])0+$/, "$1");
}

function normalizeCutRatios(cutRatios: number[] | undefined, count: number) {
  if (count <= 0) {
    return [];
  }

  const safeFallback = Array.from({ length: count }, () => 1 / count);
  if (!cutRatios || cutRatios.length !== count) {
    return safeFallback;
  }

  const cleaned = cutRatios.map((value) => (Number.isFinite(value) && value > 0 ? value : 0));
  const total = cleaned.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return safeFallback;
  }

  return cleaned.map((value) => value / total);
}

function buildCutBreakpoints(ratios: number[]) {
  let running = 0;
  return ratios.slice(0, -1).map((ratio) => {
    running += ratio;
    return running;
  });
}

function lerp(start: number, end: number, t: number) {
  return start + (end - start) * t;
}

function isConeRadialSplit(direction?: SimpleCutDirection) {
  return direction !== "arc_bands" && direction !== "horizontal_split";
}

function isCylinderPanelSplit(direction?: SimpleCutDirection) {
  return direction !== "wrap_bands" && direction !== "horizontal_split";
}

function isTrapezoidVerticalSplit(direction?: SimpleCutDirection) {
  return direction !== "horizontal_split" && direction !== "arc_bands";
}

function buildRowCounts(placed: number, cols: number) {
  const rows = Math.ceil(placed / cols);
  return Array.from({ length: rows }, (_, rowIndex) => {
    if (rowIndex < rows - 1) {
      return cols;
    }
    return placed - cols * (rows - 1);
  });
}

function buildRectPlacements(pieceW: number, pieceH: number, rowCounts: number[]) {
  const placements: ShapePlacement[] = [];
  rowCounts.forEach((count, rowIndex) => {
    for (let colIndex = 0; colIndex < count; colIndex += 1) {
      placements.push({
        x: colIndex * pieceW,
        y: rowIndex * pieceH,
        width: pieceW,
        height: pieceH,
      });
    }
  });
  return placements;
}

function buildOriginRectOffcutBands(
  placements: ShapePlacement[],
  rollW: number,
  rollL: number
) {
  if (placements.length === 0) {
    return [];
  }

  const rows = new Map<number, { y: number; height: number; maxX: number }>();

  placements.forEach((placement) => {
    const existing = rows.get(placement.y);
    const maxX = placement.x + placement.width;
    if (!existing) {
      rows.set(placement.y, {
        y: placement.y,
        height: placement.height,
        maxX,
      });
      return;
    }

    existing.maxX = Math.max(existing.maxX, maxX);
    existing.height = Math.max(existing.height, placement.height);
  });

  const sortedRows = Array.from(rows.values()).sort((a, b) => a.y - b.y);
  const bands: OffcutBand[] = [];

  sortedRows.forEach((row) => {
    const width = rollW - row.maxX;
    if (width > 0.25) {
      bands.push({
        x: row.maxX,
        y: row.y,
        width,
        height: row.height,
      });
    }
  });

  const lastRow = sortedRows.at(-1);
  if (lastRow) {
    const bottomY = lastRow.y + lastRow.height;
    const bottomHeight = rollL - bottomY;
    if (bottomHeight > 0.25) {
      bands.push({
        x: 0,
        y: bottomY,
        width: rollW,
        height: bottomHeight,
      });
    }
  }

  return bands;
}

function buildShelfGapBands(
  placements: ShapePlacement[],
  rollW: number,
  rollL: number,
) {
  if (placements.length === 0) {
    return [] as OffcutBand[];
  }

  const rows = new Map<number, { y: number; height: number; placements: ShapePlacement[] }>();

  placements.forEach((placement) => {
    const existing = rows.get(placement.y);
    if (!existing) {
      rows.set(placement.y, {
        y: placement.y,
        height: placement.height,
        placements: [placement],
      });
      return;
    }

    existing.height = Math.max(existing.height, placement.height);
    existing.placements.push(placement);
  });

  const bands: OffcutBand[] = [];
  const sortedRows = Array.from(rows.values()).sort((a, b) => a.y - b.y);

  sortedRows.forEach((row) => {
    const sortedPlacements = [...row.placements].sort((a, b) => a.x - b.x);
    let rowMaxX = 0;

    sortedPlacements.forEach((placement) => {
      rowMaxX = Math.max(rowMaxX, placement.x + placement.width);
      const underfillHeight = row.height - placement.height;
      if (underfillHeight > 0.25) {
        bands.push({
          x: placement.x,
          y: placement.y + placement.height,
          width: placement.width,
          height: underfillHeight,
        });
      }
    });

    const trailingWidth = rollW - rowMaxX;
    if (trailingWidth > 0.25) {
      bands.push({
        x: rowMaxX,
        y: row.y,
        width: trailingWidth,
        height: row.height,
      });
    }
  });

  const lastRow = sortedRows.at(-1);
  if (lastRow) {
    const bottomY = lastRow.y + lastRow.height;
    const bottomHeight = rollL - bottomY;
    if (bottomHeight > 0.25) {
      bands.push({
        x: 0,
        y: bottomY,
        width: rollW,
        height: bottomHeight,
      });
    }
  }

  return bands;
}

function countPieceFitsInBand(band: OffcutBand, pieceW: number, pieceH: number) {
  const direct = Math.floor(band.width / pieceW) * Math.floor(band.height / pieceH);
  const rotated = pieceW === pieceH
    ? direct
    : Math.floor(band.width / pieceH) * Math.floor(band.height / pieceW);
  return Math.max(direct, rotated);
}

const MIN_REUSABLE_OFFCUT_WIDTH = 11.5;
const MIN_REUSABLE_OFFCUT_HEIGHT = 12;
const MIN_REUSABLE_STRIP_WIDTH = 6;
const MIN_REUSABLE_STRIP_LENGTH = 24;

function isReusableOffcutBand(
  band: OffcutBand,
  pieceW?: number,
  pieceH?: number,
) {
  const matchesCurrentPiece = pieceW && pieceH
    ? countPieceFitsInBand(band, pieceW, pieceH) > 0
    : false;
  const matchesStandardOffcut = countPieceFitsInBand(
    band,
    MIN_REUSABLE_OFFCUT_WIDTH,
    MIN_REUSABLE_OFFCUT_HEIGHT,
  ) > 0;
  const matchesReusableStrip = countPieceFitsInBand(
    band,
    MIN_REUSABLE_STRIP_LENGTH,
    MIN_REUSABLE_STRIP_WIDTH,
  ) > 0;

  return matchesCurrentPiece || matchesStandardOffcut || matchesReusableStrip;
}

function bandFitsAnyPreviewItem(band: OffcutBand, items: PreviewItem[]) {
  return items.some((item) => countPieceFitsInBand(band, item.width, item.height) > 0)
    || isReusableOffcutBand(band);
}

function computeIntraBlankWaste(item: PreviewItem): number {
  const boxArea = item.width * item.height;
  if (item.renderShape === "sector") {
    const arc = item.arcDegrees ?? 120;
    const oR = item.outerRadius ?? 0;
    const iR = item.innerRadius ?? 0;
    return boxArea - ((arc / 360) * Math.PI * (oR ** 2 - iR ** 2));
  }
  if (item.renderShape === "trapezoid") {
    const tW = item.topWidth ?? item.width;
    const bW = item.bottomWidth ?? item.width;
    return boxArea - (((tW + bW) / 2) * item.height);
  }
  if (item.renderShape === "circle") {
    const d = item.diameter ?? item.width;
    return boxArea - (Math.PI * (d / 2) ** 2);
  }
  return 0;
}

function buildRectLayoutCandidate(
  rollW: number,
  rollL: number,
  pieceW: number,
  pieceH: number,
  qty: number,
  orientation: "default" | "rotated"
): SimpleRectLayout {
  const maxCols = Math.floor(rollW / pieceW);
  const maxRows = Math.floor(rollL / pieceH);
  const capacity = Math.max(0, maxCols * maxRows);
  const placed = Math.min(qty, capacity);
  const overflow = Math.max(0, qty - capacity);

  if (capacity === 0 || placed === 0) {
    return {
      orientation,
      pieceW,
      pieceH,
      cols: 0,
      rows: 0,
      rowCounts: [],
      capacity,
      placed,
      overflow,
      usedArea: 0,
      wasteArea: rollW * rollL,
      wastePct: 100,
      reusableArea: 0,
      scrapArea: rollW * rollL,
      reusablePieces: 0,
    };
  }

  let bestCandidate: SimpleRectLayout | null = null;

  for (let cols = 1; cols <= maxCols; cols += 1) {
    const rowCounts = buildRowCounts(placed, cols);
    const rows = rowCounts.length;
    if (rows > maxRows) {
      continue;
    }

    const placements = buildRectPlacements(pieceW, pieceH, rowCounts);
    const offcutBands = buildOriginRectOffcutBands(placements, rollW, rollL);
    let reusableArea = 0;
    let scrapArea = 0;
    let reusablePieces = 0;
    let largestReusableBand = 0;

    offcutBands.forEach((band) => {
      const area = band.width * band.height;
      if (isReusableOffcutBand(band, pieceW, pieceH)) {
        reusableArea += area;
        reusablePieces += countPieceFitsInBand(band, pieceW, pieceH);
        largestReusableBand = Math.max(largestReusableBand, area);
      } else {
        scrapArea += area;
      }
    });

    const candidate: SimpleRectLayout = {
      orientation,
      pieceW,
      pieceH,
      cols,
      rows,
      rowCounts,
      capacity,
      placed,
      overflow,
      usedArea: placed * pieceW * pieceH,
      wasteArea: Math.max(0, rollW * rollL - placed * pieceW * pieceH),
      wastePct: rollW * rollL > 0 ? ((Math.max(0, rollW * rollL - placed * pieceW * pieceH)) / (rollW * rollL)) * 100 : 100,
      reusableArea,
      scrapArea,
      reusablePieces,
    };

    if (!bestCandidate) {
      bestCandidate = candidate;
      continue;
    }

    if (candidate.scrapArea < bestCandidate.scrapArea - 0.001) {
      bestCandidate = candidate;
      continue;
    }
    if (Math.abs(candidate.scrapArea - bestCandidate.scrapArea) < 0.001) {
      if (candidate.reusablePieces > bestCandidate.reusablePieces) {
        bestCandidate = candidate;
        continue;
      }
      if (candidate.reusablePieces === bestCandidate.reusablePieces) {
        const bestLargestReusableBand = Math.max(
          0,
          ...buildOriginRectOffcutBands(
            buildRectPlacements(bestCandidate.pieceW, bestCandidate.pieceH, bestCandidate.rowCounts),
            rollW,
            rollL
          ).map((band) => band.width * band.height)
        );

        if (largestReusableBand > bestLargestReusableBand + 0.001) {
          bestCandidate = candidate;
          continue;
        }
        if (Math.abs(largestReusableBand - bestLargestReusableBand) < 0.001) {
          if (candidate.rows < bestCandidate.rows) {
            bestCandidate = candidate;
            continue;
          }
          if (candidate.rows === bestCandidate.rows && candidate.cols > bestCandidate.cols) {
            bestCandidate = candidate;
          }
        }
      }
    }
  }

  return bestCandidate ?? {
    orientation,
    pieceW,
    pieceH,
    cols: 0,
    rows: 0,
    rowCounts: [],
    capacity,
    placed,
    overflow,
    usedArea: 0,
    wasteArea: rollW * rollL,
    wastePct: 100,
    reusableArea: 0,
    scrapArea: rollW * rollL,
    reusablePieces: 0,
  };
}

function calculateSimpleRectLayout(
  rollW: number,
  rollL: number,
  cutW: number,
  cutH: number,
  qty: number
) {
  const candidates = [
    buildRectLayoutCandidate(rollW, rollL, cutW, cutH, qty, "default"),
  ];

  if (cutW !== cutH) {
    candidates.push(buildRectLayoutCandidate(rollW, rollL, cutH, cutW, qty, "rotated"));
  }

  candidates.sort((a, b) => {
    if (a.placed !== b.placed) return b.placed - a.placed;
    if (a.overflow !== b.overflow) return a.overflow - b.overflow;
    if (a.scrapArea !== b.scrapArea) return a.scrapArea - b.scrapArea;
    if (a.reusablePieces !== b.reusablePieces) return b.reusablePieces - a.reusablePieces;
    if (a.reusableArea !== b.reusableArea) return b.reusableArea - a.reusableArea;
    if (a.cols !== b.cols) return b.cols - a.cols;
    return a.orientation === "default" ? -1 : 1;
  });

  return candidates[0];
}

function calculateSimpleCircleLayout(
  rollW: number,
  rollL: number,
  diameter: number,
  qty: number
): SimpleCircleLayout {
  if (diameter <= 0 || rollW <= 0 || rollL <= 0) {
    return {
      positions: [],
      blankSize: diameter,
      capacity: 0,
      placed: 0,
      overflow: qty,
      usedArea: 0,
      wasteArea: rollW * rollL,
      wastePct: 100,
    };
  }

  const layout = calculateSimpleRectLayout(rollW, rollL, diameter, diameter, qty);
  const radius = diameter / 2;
  const usedArea = layout.placed * Math.PI * radius * radius;
  const positions = buildRectPlacements(diameter, diameter, layout.rowCounts);

  return {
    positions,
    blankSize: diameter,
    capacity: layout.capacity,
    placed: layout.placed,
    overflow: layout.overflow,
    usedArea,
    wasteArea: Math.max(0, rollW * rollL - usedArea),
    wastePct: rollW * rollL > 0 ? ((Math.max(0, rollW * rollL - usedArea)) / (rollW * rollL)) * 100 : 100,
  };
}

function calculateDirectCircleProfileLayout(
  rollW: number,
  rollL: number,
  diameter: number,
  qty: number,
  mode: "grid" | "hex" = "hex"
): SimpleCircleLayout {
  const radius = diameter / 2;
  const positions: ShapePlacement[] = [];

  if (radius <= 0 || rollW <= 0 || rollL <= 0) {
    return {
      positions: [],
      blankSize: diameter,
      capacity: 0,
      placed: 0,
      overflow: qty,
      usedArea: 0,
      wasteArea: rollW * rollL,
      wastePct: 100,
    };
  }

  const rowStep = mode === "hex" ? diameter * 0.8660254 : diameter;

  for (let row = 0; ; row += 1) {
    const cy = radius + row * rowStep;
    if (cy + radius > rollL + 0.001) break;

    const offset = mode === "hex" && row % 2 === 1 ? radius : 0;
    for (let col = 0; ; col += 1) {
      const cx = radius + offset + col * diameter;
      if (cx + radius > rollW + 0.001) break;

      positions.push({
        x: cx - radius,
        y: cy - radius,
        width: diameter,
        height: diameter,
      });
    }
  }

  const capacity = positions.length;
  const placed = Math.min(qty, capacity);
  const overflow = Math.max(0, qty - capacity);
  const usedArea = placed * Math.PI * radius * radius;

  return {
    positions: positions.slice(0, placed),
    blankSize: diameter,
    capacity,
    placed,
    overflow,
    usedArea,
    wasteArea: Math.max(0, rollW * rollL - usedArea),
    wastePct: rollW * rollL > 0 ? ((Math.max(0, rollW * rollL - usedArea)) / (rollW * rollL)) * 100 : 100,
  };
}

type SimplePreviewShape = "rect" | "circle" | "trapezoid" | "sector";

interface ShapePlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  flipped?: boolean;
}

interface OffcutBand {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PackedShapeLayout {
  positions: ShapePlacement[];
  capacity: number;
  placed: number;
  overflow: number;
  occupiedWidth: number;
  occupiedHeight: number;
}

interface PackedPreviewItemsResult {
  items: PreviewItem[];
  usedArea: number;
  occupiedWidth: number;
  occupiedHeight: number;
  freeRects?: OffcutBand[];
}

interface CutPlanStep {
  title: string;
  detail: string;
}

interface PreviewItem extends ShapePlacement {
  renderShape: SimplePreviewShape;
  label: string;
  cutDirection?: SimpleCutDirection;
  diameter?: number;
  topWidth?: number;
  bottomWidth?: number;
  innerRadius?: number;
  outerRadius?: number;
  arcDegrees?: number;
  /** NFP solver rotation in radians (0 for heuristic placements) */
  rotation?: number;
  /** Pre-computed polygon vertices (rotated + translated) from NFP solver */
  placedPolygon?: Array<{ x: number; y: number }>;
}

interface PreviewSection {
  start: number;
  end: number;
  label: string;
  item: PreviewItem & { usedArea: number };
}

interface SimplePreviewBase {
  renderShape: SimplePreviewShape;
  strategyName: string;
  strategyNote: string;
  cutDirection?: SimpleCutDirection;
  cutRatios?: number[];
  cutBreakpoints?: number[];
  cutLabels?: string[];
  profileItem?: PreviewItem;
  sections?: PreviewSection[];
  placementMode: "origin" | "center";
  wasteMode: "bands" | "summary";
  cutPlanTitle: string;
  cutSteps: CutPlanStep[];
  requestedUnits: number;
  unitsCompleted: number;
  overflowUnits: number;
  piecesShown: number;
  piecesPerUnit: number;
  usedArea: number;
  wasteArea: number;
  wastePct: number;
  reusableArea: number;
  scrapArea: number;
  occupiedWidth: number;
  occupiedHeight: number;
  items: PreviewItem[];
  offcutBands: OffcutBand[];
  scrapBands: OffcutBand[];
  fabricationScore?: number;
  fabricationBreakdown?: {
    wasteScore: number;
    reusableScore: number;
    seamScore: number;
    nestingScore: number;
  };
}

interface RectLikePreview extends SimplePreviewBase {
  renderShape: "rect" | "trapezoid" | "sector";
  placements: ShapePlacement[];
  label: string;
  topWidth?: number;
  bottomWidth?: number;
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  arcDegrees?: number;
}

interface CirclePreview extends SimplePreviewBase {
  renderShape: "circle";
  layout: SimpleCircleLayout;
  diameter: number;
}

type SimplePartPreview = RectLikePreview | CirclePreview;

function buildRectangleSteps(layout: SimpleRectLayout) {
  const width = formatInches(layout.pieceW);
  const height = formatInches(layout.pieceH);

  if (layout.orientation === "rotated") {
    return {
      title: "Rectangle cut sequence",
      steps: [
        {
          title: `Rip ${Math.max(layout.cols, 1)} strip${layout.cols === 1 ? "" : "s"} at ${width}"`,
          detail: "The part was rotated to fit the sheet more efficiently, so the first cuts follow the rotated width.",
        },
        {
          title: `Cross-cut each strip at ${height}"`,
          detail: `Finish the rotated blanks into ${width}" × ${height}" parts.`,
        },
      ],
    };
  }

  return {
    title: "Rectangle cut sequence",
    steps: [
      {
        title: `Rip ${Math.max(layout.cols, 1)} strip${layout.cols === 1 ? "" : "s"} at ${width}"`,
        detail: "Straight strip cuts keep the rectangle workflow simple for the cutter.",
      },
      {
        title: `Cross-cut each strip at ${height}"`,
        detail: `Finish the blanks into ${width}" × ${height}" parts.`,
      },
    ],
  };
}

function buildCircleSteps(diameter: number, piecesPerUnit: number) {
  const size = formatInches(diameter);
  if (piecesPerUnit <= 1) {
    return {
      title: "Circle cut sequence",
      steps: [
        {
          title: `Strike the Ø${size}" circle`,
          detail: "Lay out the full outside diameter directly on stock or on the selected blank.",
        },
        {
          title: `Finish the Ø${size}" outside cut`,
          detail: "Follow the full circular profile to complete the finished part.",
        },
      ],
    };
  }

  return {
    title: "Circle cut sequence",
    steps: [
      {
        title: `Strike the Ø${size}" profile`,
        detail: "Use the full finished diameter as the master layout for the part before dividing it into cut sections.",
      },
      {
        title: `Split the profile into ${piecesPerUnit} radial section${piecesPerUnit === 1 ? "" : "s"}`,
        detail: piecesPerUnit === 2
          ? "A single centerline creates two semicircle panels for a simpler low-waste cut."
          : `Mark ${piecesPerUnit} equal sectors from the center so the circle can be cut as smaller wedge panels with lower waste.`,
      },
      {
        title: "Cut and match the section edges",
        detail: "The stock layout packs the smaller section pieces more tightly than a full-circle cut, then those sections reconstruct the finished round profile.",
      },
    ],
  };
}

function buildCylinderSteps(width: number, height: number, piecesPerUnit: number) {
  const panelWidth = formatInches(width);
  const panelHeight = formatInches(height);
  return {
    title: "Cylinder cut sequence",
    steps: [
      {
        title: `Rip ${panelWidth}" × ${panelHeight}" wrap panel${piecesPerUnit > 1 ? "s" : ""}`,
        detail: piecesPerUnit > 1
          ? "This strategy splits the wrap into multiple panels so the stock fits more cleanly."
          : "This strategy keeps the full wrap as one rectangle per finished cylinder.",
      },
      {
        title: piecesPerUnit > 1 ? "Match and seam the wrap panels" : "Roll and seam the wrap",
        detail: "After cutting, the wrap is ready for fit-up around the cylindrical part.",
      },
    ],
  };
}

function buildConeSteps(innerRadius: number, outerRadius: number, arcDegrees: number, piecesPerUnit: number) {
  const inner = formatInches(innerRadius);
  const outer = formatInches(outerRadius);
  const sweep = Math.round(arcDegrees);
  return {
    title: "Cone spread cut sequence",
    steps: [
      {
        title: `Strike the outer arc at R${outer}"`,
        detail: `Use the same center point for the full ${sweep}° sweep so the spread stays consistent.`,
      },
      {
        title: `Strike the inner arc at R${inner}"`,
        detail: "This defines the open throat of the frustum before the side cuts are made.",
      },
      {
        title: piecesPerUnit > 1 ? "Cut the sector panels and match the seam edges" : "Cut both radial side edges",
        detail: piecesPerUnit > 1
          ? "This strategy splits the spread into smaller panels to reduce waste and improve fit on stock."
          : "The radial cuts complete the full spread profile.",
      },
    ],
  };
}

function buildTrapezoidSteps(topWidth: number, bottomWidth: number, height: number, piecesPerUnit = 1) {
  const top = formatInches(topWidth);
  const bottom = formatInches(bottomWidth);
  const tall = formatInches(height);
  if (piecesPerUnit > 1) {
    return {
      title: "Trapezoid cut sequence",
      steps: [
        {
          title: `Lay out the full ${top}" / ${bottom}" × ${tall}" profile`,
          detail: "Mark the finished hopper or transition panel at full size before breaking it into smaller cut sections.",
        },
        {
          title: `Split the profile into ${piecesPerUnit} tapered panel${piecesPerUnit === 1 ? "" : "s"}`,
          detail: `Use evenly spaced section lines so the final trapezoid is built from ${piecesPerUnit} tapered cuts instead of repeating the whole profile.`,
        },
        {
          title: "Cut the section edges and match the seams",
          detail: "The smaller tapered pieces pack more cleanly on stock, then assemble back into the full hopper panel.",
        },
      ],
    };
  }
  return {
    title: "Trapezoid cut sequence",
    steps: [
      {
        title: `Rip a ${bottom}" × ${tall}" blank`,
        detail: "The larger base width is used for the first straight cut so the blank stays easy to register.",
      },
      {
        title: `Mark the centered ${top}" top width`,
        detail: "Lay out the taper from the top corners down to the full bottom width.",
      },
      {
        title: "Cut both taper edges",
        detail: "Finishing the angled sides last gives the cleanest trapezoid panel.",
      },
    ],
  };
}

function getPlacementBounds(positions: ShapePlacement[]) {
  if (positions.length === 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      occupiedWidth: 0,
      occupiedHeight: 0,
    };
  }

  const minX = Math.min(...positions.map((position) => position.x));
  const minY = Math.min(...positions.map((position) => position.y));
  const maxX = Math.max(...positions.map((position) => position.x + position.width));
  const maxY = Math.max(...positions.map((position) => position.y + position.height));

  return {
    minX,
    minY,
    maxX,
    maxY,
    occupiedWidth: maxX - minX,
    occupiedHeight: maxY - minY,
  };
}

function centerPlacements(
  positions: ShapePlacement[],
  rollW: number,
  rollL: number
) {
  if (positions.length === 0) {
    return {
      positions,
      occupiedWidth: 0,
      occupiedHeight: 0,
    };
  }

  const bounds = getPlacementBounds(positions);
  const offsetX = (rollW - bounds.occupiedWidth) / 2 - bounds.minX;
  const offsetY = (rollL - bounds.occupiedHeight) / 2 - bounds.minY;
  const centered = positions.map((position) => ({
    ...position,
    x: position.x + offsetX,
    y: position.y + offsetY,
  }));
  const centeredBounds = getPlacementBounds(centered);

  return {
    positions: centered,
    occupiedWidth: centeredBounds.occupiedWidth,
    occupiedHeight: centeredBounds.occupiedHeight,
  };
}

function buildOffcutBands(
  bounds: ReturnType<typeof getPlacementBounds>,
  rollW: number,
  rollL: number,
  placementMode: "origin" | "center"
): OffcutBand[] {
  if (bounds.occupiedWidth <= 0 || bounds.occupiedHeight <= 0) {
    return [];
  }

  const bands: OffcutBand[] = [];
  const left = bounds.minX;
  const right = rollW - bounds.maxX;
  const top = bounds.minY;
  const bottom = rollL - bounds.maxY;

  if (placementMode === "origin") {
    if (right > 0.25) {
      bands.push({
        x: bounds.maxX,
        y: 0,
        width: right,
        height: bottom > 0.25 ? bounds.maxY : rollL,
      });
    }
    if (bottom > 0.25) {
      bands.push({ x: 0, y: bounds.maxY, width: rollW, height: bottom });
    }
    return bands;
  }

  if (top > 0.25) {
    bands.push({ x: 0, y: 0, width: rollW, height: top });
  }
  if (bottom > 0.25) {
    bands.push({ x: 0, y: bounds.maxY, width: rollW, height: bottom });
  }
  if (left > 0.25) {
    bands.push({ x: 0, y: bounds.minY, width: left, height: bounds.occupiedHeight });
  }
  if (right > 0.25) {
    bands.push({ x: bounds.maxX, y: bounds.minY, width: right, height: bounds.occupiedHeight });
  }

  return bands;
}

function calculatePackedShapeLayout(
  rollW: number,
  rollL: number,
  footprintW: number,
  footprintH: number,
  qty: number,
  options?: {
    stepX?: number;
    stepY?: number;
    rowOffset?: number;
    alternateOffset?: boolean;
    flipPattern?: "none" | "row" | "checker";
  }
): PackedShapeLayout {
  const positions: ShapePlacement[] = [];

  if (footprintW <= 0 || footprintH <= 0 || rollW <= 0 || rollL <= 0) {
    return {
      positions,
      capacity: 0,
      placed: 0,
      overflow: Math.max(0, qty),
      occupiedWidth: 0,
      occupiedHeight: 0,
    };
  }

  const stepX = options?.stepX ?? footprintW;
  const stepY = options?.stepY ?? footprintH;
  const rowOffset = options?.rowOffset ?? 0;
  const flipPattern = options?.flipPattern ?? "none";

  for (let row = 0; ; row += 1) {
    const y = row * stepY;
    if (y + footprintH > rollL + 0.001) {
      break;
    }

    const xStart = options?.alternateOffset && row % 2 === 1 ? rowOffset : 0;

    for (let col = 0; ; col += 1) {
      const x = xStart + col * stepX;
      if (x + footprintW > rollW + 0.001) {
        break;
      }

      const flipped =
        flipPattern === "checker"
          ? (row + col) % 2 === 1
          : flipPattern === "row"
            ? row % 2 === 1
            : false;

      positions.push({
        x,
        y,
        width: footprintW,
        height: footprintH,
        flipped,
      });
    }
  }

  const capacity = positions.length;
  const placed = Math.min(qty, capacity);
  const trimmed = positions.slice(0, placed);
  const { occupiedWidth, occupiedHeight } = getPlacementBounds(trimmed);

  return {
    positions: trimmed,
    capacity,
    placed,
    overflow: Math.max(0, qty - capacity),
    occupiedWidth,
    occupiedHeight,
  };
}

type PreviewPackSort = "area" | "height" | "width" | "max-edge";

function sortPreviewItems(
  items: Array<PreviewItem & { usedArea: number }>,
  sortBy: PreviewPackSort
) {
  return [...items].sort((a, b) => {
    switch (sortBy) {
      case "height":
        if (b.height !== a.height) return b.height - a.height;
        break;
      case "width":
        if (b.width !== a.width) return b.width - a.width;
        break;
      case "max-edge":
        if (Math.max(b.width, b.height) !== Math.max(a.width, a.height)) {
          return Math.max(b.width, b.height) - Math.max(a.width, a.height);
        }
        break;
      case "area":
      default:
        if (b.usedArea !== a.usedArea) return b.usedArea - a.usedArea;
        break;
    }

    if (b.height !== a.height) return b.height - a.height;
    if (b.width !== a.width) return b.width - a.width;
    return 0;
  });
}

function packPreviewItemsOnShelves(
  items: Array<PreviewItem & { usedArea: number }>,
  rollW: number,
  rollL: number,
  sortBy: PreviewPackSort,
  flipPattern?: "none" | "checker"
): PackedPreviewItemsResult {
  const sortedItems = sortPreviewItems(items, sortBy);
  const shelves: Array<{ y: number; height: number; x: number }> = [];
  const placedItems: PreviewItem[] = [];
  let usedArea = 0;
  let placedIndex = 0;

  sortedItems.forEach((item) => {
    let bestShelfIndex = -1;
    let bestShelfWaste = Number.POSITIVE_INFINITY;

    for (let index = 0; index < shelves.length; index += 1) {
      const shelf = shelves[index];
      const nextHeight = Math.max(shelf.height, item.height);
      if (shelf.x + item.width > rollW + 0.001) continue;
      if (shelf.y + nextHeight > rollL + 0.001) continue;

      const remainingWidth = rollW - (shelf.x + item.width);
      const heightPenalty = nextHeight - shelf.height;
      const shelfWaste = remainingWidth + heightPenalty * 0.75;

      if (shelfWaste < bestShelfWaste) {
        bestShelfWaste = shelfWaste;
        bestShelfIndex = index;
      }
    }

    if (bestShelfIndex === -1) {
      const nextY = shelves.length === 0
        ? 0
        : Math.max(...shelves.map((shelf) => shelf.y + shelf.height));

      if (nextY + item.height > rollL + 0.001) {
        return;
      }

      shelves.push({ y: nextY, height: item.height, x: 0 });
      bestShelfIndex = shelves.length - 1;
    }

    const shelf = shelves[bestShelfIndex];
    placedItems.push({
      ...item,
      x: shelf.x,
      y: shelf.y,
      flipped: flipPattern === "checker" ? placedIndex % 2 === 1 : (item.flipped ?? false),
    });
    placedIndex += 1;
    shelf.x += item.width;
    shelf.height = Math.max(shelf.height, item.height);
    usedArea += item.usedArea;
  });

  const bounds = getPlacementBounds(placedItems);

  return {
    items: placedItems,
    usedArea,
    occupiedWidth: bounds.occupiedWidth,
    occupiedHeight: bounds.occupiedHeight,
  };
}

function packPreviewItemsInCenteredColumn(
  items: Array<PreviewItem & { usedArea: number }>,
  rollW: number,
  rollL: number,
  gap = 0.75
): PackedPreviewItemsResult {
  const sortedItems = [...items].sort((a, b) => {
    const outerA = a.outerRadius ?? Math.max(a.width, a.height);
    const outerB = b.outerRadius ?? Math.max(b.width, b.height);
    if (outerB !== outerA) return outerB - outerA;
    if (b.usedArea !== a.usedArea) return b.usedArea - a.usedArea;
    return b.width - a.width;
  });

  const maxWidth = sortedItems.reduce((max, item) => Math.max(max, item.width), 0);
  const placedItems: PreviewItem[] = [];
  let usedArea = 0;
  let cursorY = 0;

  for (const item of sortedItems) {
    if (item.width > rollW + 0.001 || cursorY + item.height > rollL + 0.001) {
      break;
    }

    const x = Math.max(0, (maxWidth - item.width) / 2);
    placedItems.push({
      ...item,
      x,
      y: cursorY,
    });
    usedArea += item.usedArea;
    cursorY += item.height + gap;
  }

  const bounds = getPlacementBounds(placedItems);
  return {
    items: placedItems,
    usedArea,
    occupiedWidth: bounds.occupiedWidth,
    occupiedHeight: bounds.occupiedHeight,
  };
}

function packRectItemsWithGuillotine(
  items: Array<PreviewItem & { usedArea: number }>,
  rollW: number,
  rollL: number,
  sortBy: PreviewPackSort,
): PackedPreviewItemsResult {
  type RectPlacementChoice = {
    freeIndex: number;
    width: number;
    height: number;
    rotated: boolean;
    shortSide: number;
    longSide: number;
    areaFit: number;
    y: number;
    x: number;
  };

  const sortedItems = sortPreviewItems(items, sortBy);
  let freeRects: OffcutBand[] = [{ x: 0, y: 0, width: rollW, height: rollL }];
  const placedItems: PreviewItem[] = [];
  let usedArea = 0;

  const pruneFreeRects = (rects: OffcutBand[]) => rects.filter((rect, index) => {
    if (rect.width <= 0.25 || rect.height <= 0.25) {
      return false;
    }
    return !rects.some((other, otherIndex) => {
      if (index === otherIndex) return false;
      return rect.x >= other.x
        && rect.y >= other.y
        && rect.x + rect.width <= other.x + other.width
        && rect.y + rect.height <= other.y + other.height;
    });
  });

  sortedItems.forEach((item) => {
    let best: RectPlacementChoice | null = null;

    const orientations = [
      { width: item.width, height: item.height, rotated: false },
      ...(Math.abs(item.width - item.height) > 0.001
        ? [{ width: item.height, height: item.width, rotated: true }]
        : []),
    ];

    freeRects.forEach((freeRect, freeIndex) => {
      orientations.forEach((orientation) => {
        if (orientation.width > freeRect.width + 0.001 || orientation.height > freeRect.height + 0.001) {
          return;
        }

        const leftoverW = freeRect.width - orientation.width;
        const leftoverH = freeRect.height - orientation.height;
        const candidate = {
          freeIndex,
          width: orientation.width,
          height: orientation.height,
          rotated: orientation.rotated,
          shortSide: Math.min(leftoverW, leftoverH),
          longSide: Math.max(leftoverW, leftoverH),
          areaFit: leftoverW * freeRect.height + orientation.width * leftoverH,
          y: freeRect.y,
          x: freeRect.x,
        };

        if (
          !best
          || candidate.shortSide < best.shortSide - 0.001
          || (
            Math.abs(candidate.shortSide - best.shortSide) < 0.001
            && (
              candidate.longSide < best.longSide - 0.001
              || (
                Math.abs(candidate.longSide - best.longSide) < 0.001
                && (
                  candidate.areaFit < best.areaFit - 0.001
                  || (
                    Math.abs(candidate.areaFit - best.areaFit) < 0.001
                    && (candidate.y < best.y - 0.001 || (Math.abs(candidate.y - best.y) < 0.001 && candidate.x < best.x - 0.001))
                  )
                )
              )
            )
          )
        ) {
          best = candidate;
        }
      });
    });

    if (!best) {
      return;
    }

    const chosen = best as RectPlacementChoice;
    const host = freeRects[chosen.freeIndex];
    placedItems.push({
      ...item,
      x: host.x,
      y: host.y,
      width: chosen.width,
      height: chosen.height,
      flipped: chosen.rotated ? !(item.flipped ?? false) : item.flipped,
    });
    usedArea += item.usedArea;

    const nextRects = freeRects.filter((_, index) => index !== chosen.freeIndex);
    const rightRect = {
      x: host.x + chosen.width,
      y: host.y,
      width: host.width - chosen.width,
      height: chosen.height,
    };
    const bottomRect = {
      x: host.x,
      y: host.y + chosen.height,
      width: host.width,
      height: host.height - chosen.height,
    };
    nextRects.push(rightRect, bottomRect);
    freeRects = pruneFreeRects(nextRects);
  });

  const bounds = getPlacementBounds(placedItems);
  return {
    items: placedItems,
    usedArea,
    occupiedWidth: bounds.occupiedWidth,
    occupiedHeight: bounds.occupiedHeight,
    freeRects,
  };
}

function buildRectPreview(
  layout: SimpleRectLayout,
  strategyName: string,
  strategyNote: string,
  requestedUnits: number,
  piecesPerUnit: number,
  pieceArea: number,
  label: string
): RectLikePreview {
  const cutPlan = buildRectangleSteps(layout);
  const placements = buildRectPlacements(layout.pieceW, layout.pieceH, layout.rowCounts);
  const items: PreviewItem[] = placements.map((placement) => ({
    ...placement,
    renderShape: "rect",
    label,
  }));

  const { occupiedWidth, occupiedHeight } = getPlacementBounds(placements);
  const unitsCompleted = Math.floor(layout.placed / piecesPerUnit);
  const usedArea = layout.placed * pieceArea;
  return {
    renderShape: "rect",
    strategyName,
    strategyNote,
    placementMode: "origin",
    wasteMode: "bands",
    cutPlanTitle: cutPlan.title,
    cutSteps: cutPlan.steps,
    requestedUnits,
    unitsCompleted,
    overflowUnits: Math.max(0, requestedUnits - unitsCompleted),
    piecesShown: layout.placed,
    piecesPerUnit,
    usedArea,
    wasteArea: 0,
    wastePct: 0,
    reusableArea: layout.reusableArea,
    scrapArea: layout.scrapArea,
    items,
    placements,
    occupiedWidth,
    occupiedHeight,
    offcutBands: [],
    scrapBands: [],
    label,
  };
}

function withWaste(
  preview: RectLikePreview,
  rollW: number,
  rollL: number
): RectLikePreview {
  const rollArea = rollW * rollL;
  const positioned =
    preview.placementMode === "center"
      ? centerPlacements(preview.placements, rollW, rollL)
      : {
          positions: preview.placements,
          occupiedWidth: preview.occupiedWidth,
          occupiedHeight: preview.occupiedHeight,
        };
  const bounds = getPlacementBounds(positioned.positions);
  const pieceW = positioned.positions[0]?.width ?? 0;
  const pieceH = positioned.positions[0]?.height ?? 0;

  if (preview.wasteMode === "bands" && preview.placementMode === "origin") {
    if (preview.renderShape === "rect") {
      const allBands = buildOriginRectOffcutBands(positioned.positions, rollW, rollL);
      const reusableBands: OffcutBand[] = [];
      const scrapBands: OffcutBand[] = [];
      let reusableArea = 0;
      let scrapArea = 0;

      allBands.forEach((band) => {
        const area = band.width * band.height;
        if (isReusableOffcutBand(band, pieceW, pieceH)) {
          reusableBands.push(band);
          reusableArea += area;
        } else {
          scrapBands.push(band);
          scrapArea += area;
        }
      });

      const totalWasteArea = reusableArea + scrapArea;
      return {
        ...preview,
        placements: positioned.positions,
        occupiedWidth: positioned.occupiedWidth,
        occupiedHeight: positioned.occupiedHeight,
        wasteArea: totalWasteArea,
        wastePct: rollArea > 0 ? (totalWasteArea / rollArea) * 100 : 100,
        reusableArea,
        scrapArea,
        offcutBands: reusableBands,
        scrapBands,
      };
    }

    const allBands = buildOffcutBands(bounds, rollW, rollL, "origin");
    const reusableBands: OffcutBand[] = [];
    const scrapBands: OffcutBand[] = [];
    let reusableArea = 0;
    let bandScrapArea = 0;

    allBands.forEach((band) => {
      const area = band.width * band.height;
      if (isReusableOffcutBand(band, pieceW, pieceH)) {
        reusableBands.push(band);
        reusableArea += area;
      } else {
        scrapBands.push(band);
        bandScrapArea += area;
      }
    });

    const intraBlankWaste = preview.items.reduce(
      (sum, item) => sum + computeIntraBlankWaste(item), 0
    );
    const scrapArea = bandScrapArea + intraBlankWaste;
    const totalWasteArea = reusableArea + scrapArea;

    return {
      ...preview,
      placements: positioned.positions,
      occupiedWidth: positioned.occupiedWidth,
      occupiedHeight: positioned.occupiedHeight,
      wasteArea: totalWasteArea,
      wastePct: rollArea > 0 ? (totalWasteArea / rollArea) * 100 : 100,
      reusableArea,
      scrapArea,
      offcutBands: reusableBands,
      scrapBands,
    };
  }

  const totalWasteArea = Math.max(0, rollArea - preview.usedArea);
  return {
    ...preview,
    placements: positioned.positions,
    occupiedWidth: positioned.occupiedWidth,
    occupiedHeight: positioned.occupiedHeight,
    wasteArea: totalWasteArea,
    wastePct: rollArea > 0 ? (totalWasteArea / rollArea) * 100 : 100,
    reusableArea: 0,
    scrapArea: totalWasteArea,
    offcutBands:
      preview.wasteMode === "bands"
        ? buildOffcutBands(bounds, rollW, rollL, preview.placementMode)
        : [],
    scrapBands: [],
  };
}

function chooseBestPreview<T extends SimplePreviewBase & { adjustedWaste: number }>(candidates: T[]) {
  return [...candidates].sort((a, b) => {
    if (a.unitsCompleted !== b.unitsCompleted) return b.unitsCompleted - a.unitsCompleted;
    if (a.overflowUnits !== b.overflowUnits) return a.overflowUnits - b.overflowUnits;
    if (a.adjustedWaste !== b.adjustedWaste) return a.adjustedWaste - b.adjustedWaste;
    return a.piecesPerUnit - b.piecesPerUnit;
  })[0];
}

function computeFabricationScore(preview: SimplePreviewBase, rollW: number, rollL: number) {
  const rollArea = rollW * rollL;
  const wastePct = rollArea > 0 ? (preview.wasteArea / rollArea) * 100 : 100;
  const wasteScore = Math.max(0, 100 - wastePct * 2);

  const reusablePct = preview.wasteArea > 0
    ? (preview.reusableArea / preview.wasteArea) * 100 : 0;
  const reusableScore = Math.min(100, reusablePct);

  const seams = preview.piecesPerUnit;
  const seamScore = seams <= 1 ? 100 : seams <= 2 ? 85 : seams <= 4 ? 60
    : Math.max(0, 100 - seams * 8);

  const occupied = preview.occupiedWidth * preview.occupiedHeight;
  const nestingEff = occupied > 0 ? (preview.usedArea / occupied) * 100 : 0;
  const nestingScore = Math.min(100, nestingEff);

  const score = Math.round(
    wasteScore * 0.4 + reusableScore * 0.2 + seamScore * 0.2 + nestingScore * 0.2
  );
  return {
    score,
    breakdown: {
      wasteScore: Math.round(wasteScore),
      reusableScore: Math.round(reusableScore),
      seamScore: Math.round(seamScore),
      nestingScore: Math.round(nestingScore),
    },
  };
}

function compareStockLayoutPreviews(a: SimplePartPreview, b: SimplePartPreview) {
  if (a.unitsCompleted !== b.unitsCompleted) return b.unitsCompleted - a.unitsCompleted;
  if (a.overflowUnits !== b.overflowUnits) return a.overflowUnits - b.overflowUnits;
  if (Math.abs(a.scrapArea - b.scrapArea) > 0.001) return a.scrapArea - b.scrapArea;
  if (Math.abs(a.occupiedHeight - b.occupiedHeight) > 0.001) return a.occupiedHeight - b.occupiedHeight;
  const aFootprint = a.occupiedWidth * a.occupiedHeight;
  const bFootprint = b.occupiedWidth * b.occupiedHeight;
  if (Math.abs(aFootprint - bFootprint) > 0.001) return aFootprint - bFootprint;
  if (Math.abs(a.reusableArea - b.reusableArea) > 0.001) return b.reusableArea - a.reusableArea;
  if (Math.abs(a.occupiedWidth - b.occupiedWidth) > 0.001) return a.occupiedWidth - b.occupiedWidth;
  return 0;
}

function shouldAutoOptimizeInteractiveLayout(specs: SimplePartSpec[]) {
  if (specs.length !== 1) {
    return false;
  }

  const [spec] = specs;
  if (!spec) {
    return false;
  }

  // Interactive stock view needs to stay deterministic and responsive.
  // Cone/cylinder/trapezoid splits already generate valid cut pieces locally,
  // and background NFP solving has been the main source of UI jank.
  if (spec.partType === "cone" || spec.partType === "cylinder" || spec.partType === "trapezoid") {
    return false;
  }

  return false;
}

function buildOptimizedStockPreview(
  preview: SimplePartPreview,
  result: NestingResult,
  items: PreviewItem[],
  rollW: number,
  rollL: number,
): SimplePartPreview {
  const rollArea = result.stockArea > 0 ? result.stockArea : rollW * rollL;
  const usedArea = Math.max(0, result.usedArea);
  const fallbackBounds = getPlacementBounds(items);
  const occupiedWidth = result.occupiedWidth > 0 ? result.occupiedWidth : fallbackBounds.occupiedWidth;
  const occupiedHeight = result.occupiedHeight > 0 ? result.occupiedHeight : fallbackBounds.occupiedHeight;
  const occupiedArea = result.occupiedArea > 0 ? result.occupiedArea : occupiedWidth * occupiedHeight;
  const allBands = buildOffcutBands(fallbackBounds, rollW, rollL, "origin");
  const offcutBands: OffcutBand[] = [];
  const scrapBands: OffcutBand[] = [];
  let reusableArea = 0;
  let bandScrapArea = 0;

  allBands.forEach((band) => {
    const area = band.width * band.height;
    if (bandFitsAnyPreviewItem(band, items)) {
      offcutBands.push(band);
      reusableArea += area;
    } else {
      scrapBands.push(band);
      bandScrapArea += area;
    }
  });

  const scrapArea = Math.max(0, occupiedArea - usedArea) + bandScrapArea;
  const wasteArea = reusableArea + scrapArea;
  const unitsCompleted = preview.piecesPerUnit > 0
    ? Math.floor(result.placed / preview.piecesPerUnit)
    : result.placed;
  const overflowUnits = Math.max(0, preview.requestedUnits - unitsCompleted);

  return {
    ...preview,
    items,
    usedArea,
    wasteArea,
    wastePct: rollArea > 0 ? (wasteArea / rollArea) * 100 : 100,
    reusableArea,
    scrapArea,
    occupiedWidth,
    occupiedHeight,
    unitsCompleted,
    overflowUnits,
    piecesShown: items.length,
    offcutBands,
    scrapBands,
    wasteMode: "bands",
  } as SimplePartPreview;
}

function buildPackedPreview(
  layout: PackedShapeLayout,
  config: {
    renderShape: "trapezoid" | "sector";
    strategyName: string;
    strategyNote: string;
    cutDirection?: SimpleCutDirection;
    requestedUnits: number;
    piecesPerUnit: number;
    pieceArea: number;
    label: string;
    topWidth?: number;
    bottomWidth?: number;
    height?: number;
    innerRadius?: number;
    outerRadius?: number;
    arcDegrees?: number;
  }
): RectLikePreview {
  const unitsCompleted = Math.floor(layout.placed / config.piecesPerUnit);
  const usedArea = layout.placed * config.pieceArea;

  return {
    renderShape: config.renderShape,
    strategyName: config.strategyName,
    strategyNote: config.strategyNote,
    cutDirection: config.cutDirection,
    placementMode: "origin",
    wasteMode: "bands",
    cutPlanTitle: "Cut sequence",
    cutSteps: [],
    requestedUnits: config.requestedUnits,
    unitsCompleted,
    overflowUnits: Math.max(0, config.requestedUnits - unitsCompleted),
    piecesShown: layout.placed,
    piecesPerUnit: config.piecesPerUnit,
    usedArea,
    wasteArea: 0,
    wastePct: 0,
    reusableArea: 0,
    scrapArea: 0,
    items: layout.positions.map((placement) => ({
      ...placement,
      renderShape: config.renderShape,
      label: config.label,
      cutDirection: config.cutDirection,
      topWidth: config.topWidth,
      bottomWidth: config.bottomWidth,
      innerRadius: config.innerRadius,
      outerRadius: config.outerRadius,
      arcDegrees: config.arcDegrees,
    })),
    placements: layout.positions,
    occupiedWidth: layout.occupiedWidth,
    occupiedHeight: layout.occupiedHeight,
    offcutBands: [],
    scrapBands: [],
    label: config.label,
    topWidth: config.topWidth,
    bottomWidth: config.bottomWidth,
    height: config.height,
    innerRadius: config.innerRadius,
    outerRadius: config.outerRadius,
    arcDegrees: config.arcDegrees,
  };
}

function buildCustomPackedPreview(
  rollW: number,
  rollL: number,
  items: Array<PreviewItem & { usedArea: number }>,
  config: {
    renderShape: "rect" | "trapezoid" | "sector";
    strategyName: string;
    strategyNote: string;
    cutDirection?: SimpleCutDirection;
    requestedUnits: number;
    piecesPerUnit: number;
    label: string;
    topWidth?: number;
    bottomWidth?: number;
    height?: number;
    innerRadius?: number;
    outerRadius?: number;
    arcDegrees?: number;
    cutRatios?: number[];
    cutBreakpoints?: number[];
    cutLabels?: string[];
    flipPattern?: "none" | "checker";
  }
): RectLikePreview {
  const packed = packPreviewItemsOnShelves(items, rollW, rollL, "area", config.flipPattern);
  return buildCustomPackedPreviewFromPackedResult(rollW, rollL, packed, config);
}

function buildCustomPackedPreviewFromPackedResult(
  rollW: number,
  rollL: number,
  packed: PackedPreviewItemsResult,
  config: {
    renderShape: "rect" | "trapezoid" | "sector";
    strategyName: string;
    strategyNote: string;
    cutDirection?: SimpleCutDirection;
    requestedUnits: number;
    piecesPerUnit: number;
    label: string;
    topWidth?: number;
    bottomWidth?: number;
    height?: number;
    innerRadius?: number;
    outerRadius?: number;
    arcDegrees?: number;
    cutRatios?: number[];
    cutBreakpoints?: number[];
    cutLabels?: string[];
    flipPattern?: "none" | "checker";
  }
): RectLikePreview {
  const bounds = getPlacementBounds(packed.items);
  const allBands = buildOffcutBands(bounds, rollW, rollL, "origin");
  const reusableBands: OffcutBand[] = [];
  const scrapBands: OffcutBand[] = [];
  let reusableArea = 0;
  let bandScrapArea = 0;

  const firstItem = packed.items[0];
  const cpPieceW = firstItem?.width ?? 0;
  const cpPieceH = firstItem?.height ?? 0;

  allBands.forEach((band) => {
    const area = band.width * band.height;
    if (isReusableOffcutBand(band, cpPieceW, cpPieceH)) {
      reusableBands.push(band);
      reusableArea += area;
    } else {
      scrapBands.push(band);
      bandScrapArea += area;
    }
  });

  const intraBlankWaste = packed.items.reduce(
    (sum, item) => sum + computeIntraBlankWaste(item), 0
  );
  const scrapArea = bandScrapArea + intraBlankWaste;
  const wasteArea = reusableArea + scrapArea;
  const unitsCompleted = Math.floor(packed.items.length / Math.max(config.piecesPerUnit, 1));

  return {
    renderShape: config.renderShape,
    strategyName: config.strategyName,
    strategyNote: config.strategyNote,
    cutDirection: config.cutDirection,
    cutRatios: config.cutRatios,
    cutBreakpoints: config.cutBreakpoints,
    cutLabels: config.cutLabels,
    placementMode: "origin",
    wasteMode: "bands",
    cutPlanTitle: "Cut sequence",
    cutSteps: [],
    requestedUnits: config.requestedUnits,
    unitsCompleted,
    overflowUnits: Math.max(0, config.requestedUnits - unitsCompleted),
    piecesShown: packed.items.length,
    piecesPerUnit: config.piecesPerUnit,
    usedArea: packed.usedArea,
    wasteArea,
    wastePct: rollW * rollL > 0 ? (wasteArea / (rollW * rollL)) * 100 : 100,
    reusableArea,
    scrapArea,
    occupiedWidth: bounds.occupiedWidth,
    occupiedHeight: bounds.occupiedHeight,
    items: packed.items,
    offcutBands: reusableBands,
    scrapBands,
    placements: packed.items,
    label: config.label,
    topWidth: config.topWidth,
    bottomWidth: config.bottomWidth,
    height: config.height,
    innerRadius: config.innerRadius,
    outerRadius: config.outerRadius,
    arcDegrees: config.arcDegrees,
  };
}

function buildConeSplitSections(
  innerRadius: number,
  outerRadius: number,
  arcDegrees: number,
  cutDirection: SimpleCutDirection,
  cutRatios: number[] | undefined,
  requestedCutSections: number,
): {
  profileItem: PreviewItem;
  sections: PreviewSection[];
  cutBreakpoints: number[];
  cutLabels: string[];
} {
  const ratios = normalizeCutRatios(cutRatios, requestedCutSections);
  const cutBreakpoints = buildCutBreakpoints(ratios);
  const bounds = [0, ...cutBreakpoints, 1];
  const safeInnerRadius = Math.max(1, innerRadius);
  const safeOuterRadius = Math.max(safeInnerRadius + 1, outerRadius);
  const safeArcDegrees = Math.min(320, Math.max(20, arcDegrees));
  const fullHalfArcRad = (safeArcDegrees * Math.PI) / 360;
  const profileItem: PreviewItem = {
    x: 0,
    y: 0,
    width: Math.max(2, 2 * safeOuterRadius * Math.sin(fullHalfArcRad)),
    height: Math.max(2, safeOuterRadius - safeInnerRadius * Math.cos(fullHalfArcRad)),
    renderShape: "sector",
    label: `${Math.round(safeArcDegrees)}° • R${formatInches(safeInnerRadius)}"-R${formatInches(safeOuterRadius)}"`,
    cutDirection,
    innerRadius: safeInnerRadius,
    outerRadius: safeOuterRadius,
    arcDegrees: safeArcDegrees,
  };

  const sections: PreviewSection[] = bounds.slice(0, -1).map((start, index) => {
    const end = bounds[index + 1];
    if (isConeRadialSplit(cutDirection)) {
      const sectionArcDegrees = Math.max(8, safeArcDegrees * (end - start));
      const sectionHalfArcRad = (sectionArcDegrees * Math.PI) / 360;
      const label = `${Math.round(sectionArcDegrees)}° • R${formatInches(safeInnerRadius)}"-R${formatInches(safeOuterRadius)}"`;
      const item = {
        x: 0,
        y: 0,
        width: Math.max(2, 2 * safeOuterRadius * Math.sin(sectionHalfArcRad)),
        height: Math.max(2, safeOuterRadius - safeInnerRadius * Math.cos(sectionHalfArcRad)),
        renderShape: "sector" as const,
        label,
        cutDirection,
        innerRadius: safeInnerRadius,
        outerRadius: safeOuterRadius,
        arcDegrees: sectionArcDegrees,
        usedArea: (sectionArcDegrees / 360) * Math.PI * (safeOuterRadius ** 2 - safeInnerRadius ** 2),
      };
      return { start, end, label, item };
    }

    const bandInnerRadius = lerp(safeInnerRadius, safeOuterRadius, start);
    const bandOuterRadius = lerp(safeInnerRadius, safeOuterRadius, end);
    const label = `R${formatInches(bandInnerRadius)}"-R${formatInches(bandOuterRadius)}"`;
    const item = {
      x: 0,
      y: 0,
      width: Math.max(2, 2 * bandOuterRadius * Math.sin(fullHalfArcRad)),
      height: Math.max(2, bandOuterRadius - bandInnerRadius * Math.cos(fullHalfArcRad)),
      renderShape: "sector" as const,
      label,
      cutDirection,
      innerRadius: bandInnerRadius,
      outerRadius: bandOuterRadius,
      arcDegrees: safeArcDegrees,
      usedArea: (safeArcDegrees / 360) * Math.PI * (bandOuterRadius ** 2 - bandInnerRadius ** 2),
    };
    return { start, end, label, item };
  });

  return {
    profileItem,
    sections,
    cutBreakpoints,
    cutLabels: sections.map((section) => section.label),
  };
}

function buildTrapezoidSplitSections(
  topWidth: number,
  bottomWidth: number,
  height: number,
  cutDirection: SimpleCutDirection,
  cutRatios: number[] | undefined,
  requestedCutSections: number,
): {
  profileItem: PreviewItem;
  sections: PreviewSection[];
  cutBreakpoints: number[];
  cutLabels: string[];
} {
  const ratios = normalizeCutRatios(cutRatios, requestedCutSections);
  const cutBreakpoints = buildCutBreakpoints(ratios);
  const bounds = [0, ...cutBreakpoints, 1];
  const safeTopWidth = Math.max(1, topWidth);
  const safeBottomWidth = Math.max(1, bottomWidth);
  const safeHeight = Math.max(1, height);
  const profileItem: PreviewItem = {
    x: 0,
    y: 0,
    width: Math.max(safeTopWidth, safeBottomWidth),
    height: safeHeight,
    renderShape: "trapezoid",
    label: `${formatInches(safeTopWidth)}" / ${formatInches(safeBottomWidth)}" × ${formatInches(safeHeight)}"`,
    cutDirection,
    topWidth: safeTopWidth,
    bottomWidth: safeBottomWidth,
  };

  const sections: PreviewSection[] = bounds.slice(0, -1).map((start, index) => {
    const end = bounds[index + 1];
    if (isTrapezoidVerticalSplit(cutDirection)) {
      const pieceTopWidth = safeTopWidth * (end - start);
      const pieceBottomWidth = safeBottomWidth * (end - start);
      const label = `${formatInches(pieceTopWidth)}" / ${formatInches(pieceBottomWidth)}" × ${formatInches(safeHeight)}"`;
      const item = {
        x: 0,
        y: 0,
        width: Math.max(pieceTopWidth, pieceBottomWidth),
        height: safeHeight,
        renderShape: "trapezoid" as const,
        label,
        cutDirection,
        topWidth: pieceTopWidth,
        bottomWidth: pieceBottomWidth,
        usedArea: ((pieceTopWidth + pieceBottomWidth) / 2) * safeHeight,
      };
      return { start, end, label, item };
    }

    const bandTopWidth = lerp(safeTopWidth, safeBottomWidth, start);
    const bandBottomWidth = lerp(safeTopWidth, safeBottomWidth, end);
    const bandHeight = safeHeight * (end - start);
    const label = `${formatInches(bandTopWidth)}" / ${formatInches(bandBottomWidth)}" × ${formatInches(bandHeight)}"`;
    const item = {
      x: 0,
      y: 0,
      width: Math.max(bandTopWidth, bandBottomWidth),
      height: bandHeight,
      renderShape: "trapezoid" as const,
      label,
      cutDirection,
      topWidth: bandTopWidth,
      bottomWidth: bandBottomWidth,
      usedArea: ((bandTopWidth + bandBottomWidth) / 2) * bandHeight,
    };
    return { start, end, label, item };
  });

  return {
    profileItem,
    sections,
    cutBreakpoints,
    cutLabels: sections.map((section) => section.label),
  };
}

function generateRectanglePreview(
  rollW: number,
  rollL: number,
  width: number,
  length: number,
  qty: number
): SimplePartPreview {
  const layout = calculateSimpleRectLayout(rollW, rollL, width, length, qty);
  const preview = withWaste(
    buildRectPreview(
      layout,
      layout.orientation === "rotated" ? "Rotated rectangle layout" : "Direct rectangle layout",
      layout.orientation === "rotated"
        ? "The piece was rotated automatically to fit the stock more efficiently."
        : "The finished part stays a rectangle, so the cut profile matches the part directly.",
      qty,
      1,
      width * length,
      `${formatInches(layout.pieceW)}" × ${formatInches(layout.pieceH)}"`
    ),
    rollW,
    rollL
  );
  return preview;
}

function generateCirclePreview(
  rollW: number,
  rollL: number,
  diameter: number,
  qty: number
): SimplePartPreview {
  const radius = diameter / 2;
  const circleArea = Math.PI * radius * radius;
  const heroLayout = calculateDirectCircleProfileLayout(diameter, diameter, diameter, 1);
  const requestedCutSections = Math.max(1, qty);

  if (requestedCutSections > 1) {
    const sectorCount = Math.min(12, requestedCutSections);
    const sectorArcDegrees = 360 / sectorCount;
    const sectorChord = Math.max(2, 2 * radius * Math.sin(Math.PI / sectorCount));
    const sectorHeight = radius;
    const packed = withWaste(
      buildPackedPreview(
        calculatePackedShapeLayout(
          rollW,
          rollL,
          sectorChord,
          sectorHeight,
          sectorCount,
          {
            stepX: Math.max(sectorChord * 0.86, radius * 0.42),
            stepY: sectorHeight,
            rowOffset: sectorCount <= 2 ? 0 : sectorChord * 0.38,
            alternateOffset: sectorCount > 2,
            flipPattern: "checker",
          }
        ),
        {
          renderShape: "sector",
          strategyName:
            sectorCount === 2
              ? "Two half-circle panels"
              : sectorCount === 3
                ? "Three radial sectors"
                : sectorCount === 4
                  ? "Four quadrant sectors"
                  : `${sectorCount} wedge sectors`,
          strategyNote:
            sectorCount === 2
              ? "The circle is split across one centerline so the graph shows the actual two-piece cut."
              : `The circle is divided into ${sectorCount} equal radial sectors so the graph shows the actual cut geometry inside the finished profile.`,
          requestedUnits: 1,
          piecesPerUnit: sectorCount,
          pieceArea: circleArea / sectorCount,
          label: `${Math.round(sectorArcDegrees)}° sector`,
          innerRadius: 0,
          outerRadius: radius,
          arcDegrees: sectorArcDegrees,
        }
      ),
      rollW,
      rollL
    );
    const cutPlan = buildCircleSteps(diameter, sectorCount);

    return {
      ...packed,
      renderShape: "circle",
      cutPlanTitle: cutPlan.title,
      cutSteps: cutPlan.steps,
      layout: heroLayout,
      diameter,
    };
  }

  const directCircleCandidates = [
    {
      strategyName: "Direct full-circle layout",
      strategyNote: "Keep each finished circle as one outside cut when the selected stock allows it cleanly.",
      mode: "hex" as const,
      strategyPenalty: 0,
    },
    {
      strategyName: "Direct grid-circle layout",
      strategyNote: "A straight full-circle grid is easier to read on the floor, but usually leaves a little more scrap than staggered placement.",
      mode: "grid" as const,
      strategyPenalty: 2,
    },
  ].map((candidate) => {
    const layout = calculateDirectCircleProfileLayout(rollW, rollL, diameter, qty, candidate.mode);
    const bounds = getPlacementBounds(layout.positions);
    const reusableBands = buildOffcutBands(bounds, rollW, rollL, "origin");
    const reusableArea = reusableBands.reduce((sum, band) => sum + band.width * band.height, 0);
    const occupiedArea = bounds.occupiedWidth * bounds.occupiedHeight;
    const scrapArea = Math.max(0, occupiedArea - layout.usedArea);
    const wasteArea = reusableArea + scrapArea;

    return {
      renderShape: "circle" as const,
      strategyName: candidate.strategyName,
      strategyNote: candidate.strategyNote,
      placementMode: "origin" as const,
      wasteMode: "bands" as const,
      cutPlanTitle: "Circle cut sequence",
      cutSteps: buildCircleSteps(diameter, 1).steps,
      requestedUnits: qty,
      unitsCompleted: layout.placed,
      overflowUnits: layout.overflow,
      piecesShown: layout.placed,
      piecesPerUnit: 1,
      usedArea: layout.usedArea,
      wasteArea,
      wastePct: rollW * rollL > 0 ? (wasteArea / (rollW * rollL)) * 100 : 100,
      reusableArea,
      scrapArea,
      occupiedWidth: bounds.occupiedWidth,
      occupiedHeight: bounds.occupiedHeight,
      items: layout.positions.map((position) => ({
        ...position,
        renderShape: "circle" as const,
        label: `Ø${formatInches(diameter)}"`,
        diameter,
      })),
      offcutBands: reusableBands,
      scrapBands: [],
      layout,
      diameter,
      adjustedWaste:
        (rollW * rollL > 0 ? (scrapArea / (rollW * rollL)) * 100 : 100) +
        ((occupiedArea / Math.max(rollW * rollL, 1)) * 5) +
        candidate.strategyPenalty,
    };
  });

  const panelizedCircleCandidates = [
    {
      strategyName: "Two half-circle panels",
      strategyNote: "The circle is split across one centerline so two semicircle panels can be nested more tightly on stock.",
      piecesPerUnit: 2,
      arcDegrees: 180,
      footprintW: diameter,
      footprintH: radius,
      options: {
        stepX: diameter,
        stepY: radius,
        rowOffset: diameter / 2,
        alternateOffset: true,
        flipPattern: "row" as const,
      },
      strategyPenalty: 14,
    },
    {
      strategyName: "Three radial sectors",
      strategyNote: "The circle is divided into three wedge panels so the cut geometry is visible while still keeping waste reasonable.",
      piecesPerUnit: 3,
      arcDegrees: 120,
      footprintW: Math.max(2, 2 * radius * Math.sin(Math.PI / 3)),
      footprintH: radius,
      options: {
        stepX: Math.max(2, 2 * radius * Math.sin(Math.PI / 3) * 0.82),
        stepY: radius,
        rowOffset: radius * 0.5,
        alternateOffset: true,
        flipPattern: "checker" as const,
      },
      strategyPenalty: 22,
    },
    {
      strategyName: "Six wedge sectors",
      strategyNote: "The circle is cut into six smaller wedge panels, which can pack tightly and clearly show the geometric cut strategy.",
      piecesPerUnit: 6,
      arcDegrees: 60,
      footprintW: radius,
      footprintH: radius,
      options: {
        stepX: radius * 0.92,
        stepY: radius,
        rowOffset: radius * 0.46,
        alternateOffset: true,
        flipPattern: "checker" as const,
      },
      strategyPenalty: 38,
    },
  ].map((candidate) => {
    const packed = withWaste(
      buildPackedPreview(
        calculatePackedShapeLayout(
          rollW,
          rollL,
          candidate.footprintW,
          candidate.footprintH,
          qty * candidate.piecesPerUnit,
          candidate.options
        ),
        {
          renderShape: "sector",
          strategyName: candidate.strategyName,
          strategyNote: candidate.strategyNote,
          requestedUnits: qty,
          piecesPerUnit: candidate.piecesPerUnit,
          pieceArea: circleArea / candidate.piecesPerUnit,
          label: `${Math.round(candidate.arcDegrees)}° sector`,
          innerRadius: 0,
          outerRadius: radius,
          arcDegrees: candidate.arcDegrees,
        }
      ),
      rollW,
      rollL
    );

    return {
      ...packed,
      adjustedWaste:
        (rollW * rollL > 0 ? (packed.scrapArea / (rollW * rollL)) * 100 : 100) +
        ((packed.occupiedWidth * packed.occupiedHeight) / Math.max(rollW * rollL, 1)) * 8 +
        candidate.strategyPenalty,
    };
  });

  const best = chooseBestPreview([...directCircleCandidates, ...panelizedCircleCandidates]);
  const cutPlan = buildCircleSteps(diameter, best.piecesPerUnit);

  return {
    ...best,
    renderShape: "circle",
    cutPlanTitle: cutPlan.title,
    cutSteps: cutPlan.steps,
    layout: heroLayout,
    diameter,
  };
}

// Cylinder flat patterns are rectangles — existing rect grid packing is already optimal.
// No alternating-orientation nesting needed.
function generateCylinderPreview(
  rollW: number,
  rollL: number,
  diameter: number,
  height: number,
  qty: number,
  cutDirection: SimpleCutDirection = "wrap_panels",
  cutRatios?: number[]
): SimplePartPreview {
  const circumference = Math.PI * diameter;
  if (qty > 1) {
    const ratios = normalizeCutRatios(cutRatios, qty);
    const pieces = ratios.map((ratio, index) => {
      const panelWidth = isCylinderPanelSplit(cutDirection) ? circumference * ratio : circumference;
      const panelHeight = isCylinderPanelSplit(cutDirection) ? height : height * ratio;
      return {
        x: 0,
        y: 0,
        width: panelWidth,
        height: panelHeight,
        renderShape: "rect" as const,
        label: `${formatInches(panelWidth)}" × ${formatInches(panelHeight)}"`,
        usedArea: panelWidth * panelHeight,
      };
    });
    const panelLayout = buildCustomPackedPreview(rollW, rollL, pieces, {
      renderShape: "rect",
      strategyName: isCylinderPanelSplit(cutDirection) ? `${qty}-panel cylinder wrap` : `${qty}-band cylinder wrap`,
      strategyNote: isCylinderPanelSplit(cutDirection)
        ? `The cylinder wrap is split into ${qty} vertical panels around the circumference.`
        : `The cylinder wrap is split into ${qty} horizontal bands through the height.`,
      cutDirection,
      requestedUnits: 1,
      piecesPerUnit: qty,
      label: pieces[0]?.label ?? "",
      cutRatios: ratios,
      cutBreakpoints: buildCutBreakpoints(ratios),
      cutLabels: pieces.map((piece) => piece.label),
    });
    const cutPlan = buildCylinderSteps(
      isCylinderPanelSplit(cutDirection) ? circumference * ratios[0] : circumference,
      isCylinderPanelSplit(cutDirection) ? height : height * ratios[0],
      qty
    );
    return {
      ...panelLayout,
      cutDirection,
      cutRatios: ratios,
      cutPlanTitle: cutPlan.title,
      cutSteps: cutPlan.steps,
    };
  }

  const fullWrap = withWaste(
    buildRectPreview(
      calculateSimpleRectLayout(rollW, rollL, circumference, height, qty),
      "Single flat cylinder wrap",
      "The cylinder body is flattened into one rectangular wrap per finished part.",
      qty,
      1,
      circumference * height,
      `${formatInches(circumference)}" × ${formatInches(height)}"`
    ),
    rollW,
    rollL
  );
  const splitWrap = withWaste(
    buildRectPreview(
      calculateSimpleRectLayout(rollW, rollL, circumference / 2, height, qty * 2),
      "Two-panel cylinder wrap",
      "The full wrap is split into two rectangular panels to fit the stock when a single wrap wastes too much or does not fit cleanly.",
      qty,
      2,
      (circumference / 2) * height,
      `${formatInches(circumference / 2)}" × ${formatInches(height)}"`
    ),
    rollW,
    rollL
  );

  const best = chooseBestPreview([
    {
      ...fullWrap,
      adjustedWaste: rollW * rollL > 0 ? (fullWrap.scrapArea / (rollW * rollL)) * 100 : 100,
    },
    {
      ...splitWrap,
      adjustedWaste: (rollW * rollL > 0 ? (splitWrap.scrapArea / (rollW * rollL)) * 100 : 100) + 6,
    },
  ]);

  const cutPlan = buildCylinderSteps(circumference / best.piecesPerUnit, height, best.piecesPerUnit);

  return {
    ...best,
    cutDirection,
    cutPlanTitle: cutPlan.title,
    cutSteps: cutPlan.steps,
  };
}

function generateConePreview(
  rollW: number,
  rollL: number,
  innerRadius: number,
  outerRadius: number,
  arcDegrees: number,
  qty: number,
  cutDirection: SimpleCutDirection = "radial_split",
  cutRatios?: number[]
): SimplePartPreview {
  const safeInnerRadius = Math.max(1, innerRadius);
  const safeOuterRadius = Math.max(safeInnerRadius + 1, outerRadius);
  const safeArcDegrees = Math.min(320, Math.max(20, arcDegrees));
  const arcArea = (safeArcDegrees / 360) * Math.PI * (safeOuterRadius ** 2 - safeInnerRadius ** 2);
  const requestedCutSections = Math.max(1, qty);
  const halfArcRad = (safeArcDegrees * Math.PI) / 360;
  const sectorWidth = Math.max(2, 2 * safeOuterRadius * Math.sin(halfArcRad));
  const sectorHeight = Math.max(2, safeOuterRadius - safeInnerRadius * Math.cos(halfArcRad));

  if (requestedCutSections > 1) {
    const split = buildConeSplitSections(
      safeInnerRadius,
      safeOuterRadius,
      safeArcDegrees,
      cutDirection,
      cutRatios,
      requestedCutSections,
    );

    const sectionItems = split.sections.map((section) => section.item);
    const previewConfig = {
      renderShape: "sector" as const,
      strategyName:
        isConeRadialSplit(cutDirection)
          ? `${requestedCutSections}-panel radial cone spread`
          : `${requestedCutSections}-band concentric cone spread`,
      strategyNote:
        isConeRadialSplit(cutDirection)
          ? `The cone spread is split into ${requestedCutSections} radial panel${requestedCutSections === 1 ? "" : "s"} and packed from those actual cut pieces.`
          : `The cone spread is split into ${requestedCutSections} concentric band${requestedCutSections === 1 ? "" : "s"} and stacked by band size on stock from those actual cut pieces.`,
      cutDirection,
      requestedUnits: 1,
      piecesPerUnit: requestedCutSections,
      label: split.profileItem.label,
      innerRadius: safeInnerRadius,
      outerRadius: safeOuterRadius,
      arcDegrees: safeArcDegrees,
      cutRatios,
      cutBreakpoints: split.cutBreakpoints,
      cutLabels: split.cutLabels,
      flipPattern: isConeRadialSplit(cutDirection) ? "checker" as const : "none" as const,
    };

    const preview = isConeRadialSplit(cutDirection)
      ? buildCustomPackedPreview(rollW, rollL, sectionItems, previewConfig)
      : buildCustomPackedPreviewFromPackedResult(
          rollW,
          rollL,
          packPreviewItemsInCenteredColumn(sectionItems, rollW, rollL),
          previewConfig
        );

    const cutPlan = buildConeSteps(safeInnerRadius, safeOuterRadius, safeArcDegrees, requestedCutSections);

    return {
      ...preview,
      cutDirection,
      cutRatios: normalizeCutRatios(cutRatios, requestedCutSections),
      cutBreakpoints: split.cutBreakpoints,
      cutLabels: split.cutLabels,
      profileItem: split.profileItem,
      sections: split.sections,
      cutPlanTitle: cutPlan.title,
      cutSteps: cutPlan.steps,
      arcDegrees: safeArcDegrees,
    };
  }

  const rollArea = rollW * rollL;
  const sectorConfig = {
    renderShape: "sector" as const,
    requestedUnits: qty,
    piecesPerUnit: 1,
    pieceArea: arcArea,
    label: `${Math.round(safeArcDegrees)}° sector`,
    innerRadius: safeInnerRadius,
    outerRadius: safeOuterRadius,
    arcDegrees: safeArcDegrees,
  };

  const directGrid = withWaste(
    buildPackedPreview(
      calculatePackedShapeLayout(rollW, rollL, sectorWidth, sectorHeight, qty),
      {
        ...sectorConfig,
        strategyName: "Single cone spread",
        strategyNote: "The cone/frustum liner is flattened into one full annular-sector spread per finished part.",
      }
    ),
    rollW,
    rollL
  );

  const checkerGrid = withWaste(
    buildPackedPreview(
      calculatePackedShapeLayout(rollW, rollL, sectorWidth, sectorHeight, qty, {
        stepX: Math.max(sectorWidth * 0.7, 2),
        stepY: Math.max(sectorHeight * 0.88, 2),
        rowOffset: sectorWidth * 0.38,
        alternateOffset: true,
        flipPattern: "checker",
      }),
      {
        ...sectorConfig,
        strategyName: "Alternating cone spreads",
        strategyNote: "Full cone spreads alternate up/down to interlock arcs and reduce corner waste between pieces.",
      }
    ),
    rollW,
    rollL
  );

  const bestSector = chooseBestPreview([
    { ...directGrid, adjustedWaste: rollArea > 0 ? (directGrid.scrapArea / rollArea) * 100 : 100 },
    { ...checkerGrid, adjustedWaste: rollArea > 0 ? (checkerGrid.scrapArea / rollArea) * 100 : 100 },
  ]);

  const singleCutPlan = buildConeSteps(safeInnerRadius, safeOuterRadius, safeArcDegrees, 1);

  return {
    ...bestSector,
    cutDirection,
    profileItem: {
      x: 0,
      y: 0,
      width: sectorWidth,
      height: sectorHeight,
      renderShape: "sector",
      label: `${Math.round(safeArcDegrees)}° sector`,
      cutDirection,
      innerRadius: safeInnerRadius,
      outerRadius: safeOuterRadius,
      arcDegrees: safeArcDegrees,
    },
    cutPlanTitle: singleCutPlan.title,
    cutSteps: singleCutPlan.steps,
    arcDegrees: safeArcDegrees,
  };
}

function generateTrapezoidPreview(
  rollW: number,
  rollL: number,
  topWidth: number,
  bottomWidth: number,
  height: number,
  qty: number,
  cutDirection: SimpleCutDirection = "vertical_split",
  cutRatios?: number[]
): SimplePartPreview {
  const boxWidth = Math.max(topWidth, bottomWidth);
  const pieceArea = ((topWidth + bottomWidth) / 2) * height;
  const requestedCutSections = Math.max(1, qty);

  if (requestedCutSections > 1) {
    const split = buildTrapezoidSplitSections(
      topWidth,
      bottomWidth,
      height,
      cutDirection,
      cutRatios,
      requestedCutSections,
    );

    const preview = buildCustomPackedPreview(
      rollW,
      rollL,
      split.sections.map((section) => section.item),
      {
        renderShape: "trapezoid",
        strategyName:
          isTrapezoidVerticalSplit(cutDirection)
            ? `${requestedCutSections}-panel tapered split`
            : `${requestedCutSections}-band tapered split`,
        strategyNote:
          isTrapezoidVerticalSplit(cutDirection)
            ? `The tapered panel is split into ${requestedCutSections} tapered section${requestedCutSections === 1 ? "" : "s"} and packed from those actual cut pieces.`
            : `The tapered panel is split into ${requestedCutSections} horizontal band${requestedCutSections === 1 ? "" : "s"} and packed from those actual cut pieces.`,
        cutDirection,
        requestedUnits: 1,
        piecesPerUnit: requestedCutSections,
        label: split.profileItem.label,
        topWidth,
        bottomWidth,
        height,
        cutRatios,
        cutBreakpoints: split.cutBreakpoints,
        cutLabels: split.cutLabels,
        flipPattern: isTrapezoidVerticalSplit(cutDirection) ? "checker" : "none",
      }
    );

    const cutPlan = buildTrapezoidSteps(topWidth, bottomWidth, height, requestedCutSections);

    return {
      ...preview,
      cutDirection,
      cutRatios: normalizeCutRatios(cutRatios, requestedCutSections),
      cutBreakpoints: split.cutBreakpoints,
      cutLabels: split.cutLabels,
      profileItem: split.profileItem,
      sections: split.sections,
      cutPlanTitle: cutPlan.title,
      cutSteps: cutPlan.steps,
      topWidth,
      bottomWidth,
      height,
    };
  }

  const rollArea = rollW * rollL;
  const trapLabel = `${formatInches(topWidth)}" / ${formatInches(bottomWidth)}" × ${formatInches(height)}"`;
  const trapConfig = {
    renderShape: "trapezoid" as const,
    requestedUnits: qty,
    piecesPerUnit: 1,
    pieceArea,
    label: trapLabel,
    topWidth,
    bottomWidth,
    height,
  };

  const direct = withWaste(
    buildPackedPreview(
      calculatePackedShapeLayout(rollW, rollL, boxWidth, height, qty),
      {
        ...trapConfig,
        strategyName: "Direct trapezoid panel",
        strategyNote: "The finished part is a trapezoid panel, so the preview keeps the actual panel shape for each cut.",
      }
    ),
    rollW,
    rollL
  );

  const avgWidth = (topWidth + bottomWidth) / 2;
  const checker = withWaste(
    buildPackedPreview(
      calculatePackedShapeLayout(rollW, rollL, boxWidth, height, qty, {
        stepX: Math.max(avgWidth, 2),
        stepY: height,
        flipPattern: "checker",
      }),
      {
        ...trapConfig,
        strategyName: "Head-to-tail trapezoid nesting",
        strategyNote: "Trapezoids alternate taper direction so the wider and narrower edges interlock, reducing gap waste.",
      }
    ),
    rollW,
    rollL
  );

  const bestTrap = chooseBestPreview([
    { ...direct, adjustedWaste: rollArea > 0 ? (direct.scrapArea / rollArea) * 100 : 100 },
    { ...checker, adjustedWaste: rollArea > 0 ? (checker.scrapArea / rollArea) * 100 : 100 },
  ]);

  const directCutPlan = buildTrapezoidSteps(topWidth, bottomWidth, height);

  return {
    ...bestTrap,
    cutDirection,
    profileItem: {
      x: 0,
      y: 0,
      width: boxWidth,
      height,
      renderShape: "trapezoid",
      label: trapLabel,
      cutDirection,
      topWidth,
      bottomWidth,
    },
    cutPlanTitle: directCutPlan.title,
    cutSteps: directCutPlan.steps,
  };
}

function getPartTypeLabel(partType: SimplePartType) {
  switch (partType) {
    case "circle":
      return "Circle";
    case "cylinder":
      return "Cylinder Wrap";
    case "cone":
      return "Cone Spread";
    case "trapezoid":
      return "Trapezoid";
    case "rectangle":
    default:
      return "Rectangle";
  }
}

function buildPartPreviewItem(spec: SimplePartSpec, fallbackWidth: number, fallbackHeight: number): PreviewItem & { usedArea: number } {
  switch (spec.partType) {
    case "circle": {
      const diameter = spec.diameter ?? fallbackWidth;
      const radius = diameter / 2;
      return {
        x: 0,
        y: 0,
        width: diameter,
        height: diameter,
        renderShape: "circle",
        label: `Ø${formatInches(diameter)}"`,
        diameter,
        usedArea: Math.PI * radius * radius,
      };
    }
    case "cylinder": {
      const diameter = spec.diameter ?? fallbackWidth;
      const height = spec.height ?? fallbackHeight;
      const circumference = Math.PI * diameter;
      return {
        x: 0,
        y: 0,
        width: circumference,
        height,
        renderShape: "rect",
        label: `${formatInches(circumference)}" × ${formatInches(height)}"`,
        cutDirection: spec.cutDirection,
        usedArea: circumference * height,
      };
    }
    case "cone": {
      const innerRadius = spec.innerRadius ?? Math.max(1, fallbackWidth / 2);
      const outerRadius = spec.outerRadius ?? Math.max(innerRadius + 1, fallbackHeight);
      const arcDegrees = spec.arcDegrees ?? 120;
      const halfArcRad = (arcDegrees * Math.PI) / 360;
      const width = Math.max(2, 2 * outerRadius * Math.sin(halfArcRad));
      const height = Math.max(2, outerRadius - innerRadius * Math.cos(halfArcRad));
      return {
        x: 0,
        y: 0,
        width,
        height,
        renderShape: "sector",
        label: `${Math.round(arcDegrees)}° sector`,
        cutDirection: spec.cutDirection,
        innerRadius,
        outerRadius,
        arcDegrees,
        usedArea: (arcDegrees / 360) * Math.PI * (outerRadius ** 2 - innerRadius ** 2),
      };
    }
    case "trapezoid": {
      const topWidth = spec.topWidth ?? fallbackWidth;
      const bottomWidth = spec.bottomWidth ?? fallbackWidth;
      const height = spec.height ?? fallbackHeight;
      return {
      x: 0,
      y: 0,
      width: Math.max(topWidth, bottomWidth),
      height,
      renderShape: "trapezoid",
      label: `${formatInches(topWidth)}" / ${formatInches(bottomWidth)}" × ${formatInches(height)}"`,
      cutDirection: spec.cutDirection,
      topWidth,
      bottomWidth,
      usedArea: ((topWidth + bottomWidth) / 2) * height,
    };
  }
    case "rectangle":
    default: {
      const width = spec.width ?? fallbackWidth;
      const height = spec.length ?? fallbackHeight;
      return {
        x: 0,
        y: 0,
        width,
        height,
        renderShape: "rect",
        label: `${formatInches(width)}" × ${formatInches(height)}"`,
        usedArea: width * height,
      };
    }
  }
}

function generateMultiPartPreview(
  rollW: number,
  rollL: number,
  simpleParts: SimplePartSpec[],
  fallbackWidth: number,
  fallbackHeight: number
): SimplePartPreview {
  const requestedItems = simpleParts.flatMap((spec) =>
    Array.from({ length: Math.max(1, spec.quantity || 1) }, () =>
      buildPartPreviewItem(spec, fallbackWidth, fallbackHeight)
    )
  );
  const allRectangles = requestedItems.every((item) => item.renderShape === "rect");
  const candidates = (["area", "height", "width", "max-edge"] as const).map((sortBy) => {
    const packed = allRectangles
      ? packRectItemsWithGuillotine(requestedItems, rollW, rollL, sortBy)
      : packPreviewItemsOnShelves(requestedItems, rollW, rollL, sortBy);
    const bounds = getPlacementBounds(packed.items);
    const allBands = allRectangles
      ? (packed.freeRects ?? [])
      : buildShelfGapBands(packed.items, rollW, rollL);
    const offcutBands: OffcutBand[] = [];
    const scrapBands: OffcutBand[] = [];
    let reusableArea = 0;
    let scrapArea = 0;

    allBands.forEach((band) => {
      const area = band.width * band.height;
      if (bandFitsAnyPreviewItem(band, packed.items)) {
        offcutBands.push(band);
        reusableArea += area;
      } else {
        scrapBands.push(band);
        scrapArea += area;
      }
    });

    const intraBlankWaste = packed.items.reduce(
      (sum, item) => sum + computeIntraBlankWaste(item),
      0,
    );
    scrapArea += intraBlankWaste;
    const trimDensity = bounds.occupiedWidth * bounds.occupiedHeight > 0
      ? scrapArea / (bounds.occupiedWidth * bounds.occupiedHeight)
      : 1;

    return {
      sortBy,
      packed,
      bounds,
      offcutBands,
      scrapBands,
      reusableArea,
      scrapArea,
      trimDensity,
    };
  });

  candidates.sort((a, b) => {
    if (a.packed.items.length !== b.packed.items.length) return b.packed.items.length - a.packed.items.length;
    if (Math.abs(a.scrapArea - b.scrapArea) > 0.001) return a.scrapArea - b.scrapArea;
    if (Math.abs(a.trimDensity - b.trimDensity) > 0.0001) return a.trimDensity - b.trimDensity;
    if (Math.abs(a.reusableArea - b.reusableArea) > 0.001) return b.reusableArea - a.reusableArea;
    if (Math.abs(a.bounds.occupiedHeight - b.bounds.occupiedHeight) > 0.001) return a.bounds.occupiedHeight - b.bounds.occupiedHeight;
    return 0;
  });

  const best = candidates[0];
  const placedItems = best?.packed.items ?? [];
  const usedArea = best?.packed.usedArea ?? 0;
  const bounds = best?.bounds ?? getPlacementBounds([]);
  const offcutBands = best?.offcutBands ?? [];
  const scrapBands = best?.scrapBands ?? [];
  const reusableArea = best?.reusableArea ?? 0;
  const scrapArea = best?.scrapArea ?? 0;
  const wasteArea = reusableArea + scrapArea;
  const partType = simpleParts[0]?.partType ?? "rectangle";
  const partLabel = getPartTypeLabel(partType);

  return {
    renderShape: placedItems[0]?.renderShape ?? "rect",
    strategyName: `${partLabel} mixed-size layout`,
    strategyNote: best
      ? `Selected standard sizes are packed together on the chosen stock using a ${allRectangles ? "guillotine-fit" : `${best.sortBy}-first shelf`} layout scored for lower trim scrap.`
      : "Selected standard sizes are packed together on the chosen stock preview.",
    placementMode: "origin",
    wasteMode: "bands",
    cutPlanTitle: `${partLabel} cut sequence`,
    cutSteps: [
      {
        title: "Rough-cut the selected blanks in placement order",
        detail: "The preview stacks every selected size on the same stock so the operator can work from one layout.",
      },
      {
        title: "Finish each profile from its placed blank",
        detail: "Non-rectangular parts show their blank scrap directly so the cutter can see where the finished profile comes out of each placement.",
      },
    ],
    requestedUnits: requestedItems.length,
    unitsCompleted: placedItems.length,
    overflowUnits: Math.max(0, requestedItems.length - placedItems.length),
    piecesShown: placedItems.length,
    piecesPerUnit: 1,
    usedArea,
    wasteArea,
    wastePct: rollW * rollL > 0 ? (wasteArea / (rollW * rollL)) * 100 : 100,
    reusableArea,
    scrapArea,
    occupiedWidth: bounds.occupiedWidth,
    occupiedHeight: bounds.occupiedHeight,
    items: placedItems,
    offcutBands,
    scrapBands,
    placements: placedItems,
    label: placedItems[0]?.label ?? "",
  } as RectLikePreview;
}

function generateSimplePartPreview(
  rollW: number,
  rollL: number,
  simplePart: NonNullable<NestingVisualizerProps["simplePart"]>,
  fallbackWidth: number,
  fallbackHeight: number,
  fallbackQty: number
): SimplePartPreview {
  const qty = Math.max(1, simplePart.quantity || fallbackQty);

  switch (simplePart.partType) {
    case "circle":
      return generateCirclePreview(rollW, rollL, simplePart.diameter ?? fallbackWidth, qty);
    case "cylinder":
      return generateCylinderPreview(
        rollW,
        rollL,
        simplePart.diameter ?? fallbackWidth,
        simplePart.height ?? fallbackHeight,
        qty,
        simplePart.cutDirection,
        simplePart.cutRatios
      );
    case "cone":
      return generateConePreview(
        rollW,
        rollL,
        simplePart.innerRadius ?? Math.max(1, fallbackWidth / 2),
        simplePart.outerRadius ?? Math.max(2, fallbackHeight),
        simplePart.arcDegrees ?? 120,
        qty,
        simplePart.cutDirection,
        simplePart.cutRatios
      );
    case "trapezoid":
      return generateTrapezoidPreview(
        rollW,
        rollL,
        simplePart.topWidth ?? fallbackWidth,
        simplePart.bottomWidth ?? fallbackWidth,
        simplePart.height ?? fallbackHeight,
        qty,
        simplePart.cutDirection,
        simplePart.cutRatios
      );
    case "rectangle":
    default:
      return generateRectanglePreview(rollW, rollL, simplePart.width ?? fallbackWidth, simplePart.length ?? fallbackHeight, qty);
  }
}

// Mini roll preview renderer 
function drawMiniRoll(
  svg: SVGSVGElement, s: ScoredStrategy,
  rollW: number, rollL: number, grain: GrainDir
) {
  const W = 200, H = 118, P = 12, RW = W - P * 2, RH = H - P * 2;
  const sx = RW / rollW, sy = RH / rollL;
  svg.innerHTML = "";
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

  se("rect", { x: P, y: P, width: RW, height: RH, fill: "#12141a", stroke: "#6b7280", "stroke-width": "1", rx: "2" }, svg);

  const uw = s.cols * s.cutW * sx, uh = s.rows * s.cutH * sy;
  if (uw < RW) se("rect", { x: P + uw, y: P, width: RW - uw, height: RH, fill: "rgba(220,38,38,0.15)", stroke: "#ef4444", "stroke-width": "0.5", "stroke-dasharray": "3 2" }, svg);
  if (uh < RH) se("rect", { x: P, y: P + uh, width: uw || RW, height: RH - uh, fill: "rgba(220,38,38,0.15)", stroke: "#ef4444", "stroke-width": "0.5", "stroke-dasharray": "3 2" }, svg);

  const diagAng  = s.diagType === "corner" ? Math.atan2(s.cutH, s.cutW) * 180 / Math.PI : (s.diagAngle ?? 45);
  const diagRad  = diagAng * Math.PI / 180;
  const doff     = Math.min(s.cutH / Math.tan(diagRad), s.cutW);

  for (let r = 0; r < s.rows; r++) for (let c = 0; c < s.cols; c++) {
    const px = P + c * s.cutW * sx, py = P + r * s.cutH * sy;
    const pw = s.cutW * sx, ph = s.cutH * sy;
    if (s.method === "diag") {
      const op = Math.min(doff * sx, pw);
      const pA = s.ddir === "ltr" ? `${px},${py+ph} ${px+pw},${py+ph} ${px+op},${py}` : `${px},${py+ph} ${px+pw},${py+ph} ${px+pw},${py} ${px+pw-op},${py}`;
      const pB = s.ddir === "ltr" ? `${px},${py} ${px+pw},${py} ${px+op},${py} ${px},${py+ph}` : `${px},${py} ${px+pw-op},${py} ${px},${py+ph}`;
      se("polygon", { points: pA, fill: "rgba(74,222,128,0.28)",  stroke: "#22c55e", "stroke-width": "0.7" }, svg);
      se("polygon", { points: pB, fill: "rgba(59,130,246,0.22)",  stroke: "#3b82f6", "stroke-width": "0.7" }, svg);
      const x1 = s.ddir === "ltr" ? px : px + pw, y1 = py + ph;
      const x2 = s.ddir === "ltr" ? px + op : px + pw - op, y2 = py;
      se("line", { x1, y1, x2, y2, stroke: "#facc15", "stroke-width": "1" }, svg);
    } else {
      se("rect", { x: px + 0.5, y: py + 0.5, width: pw - 1, height: ph - 1, fill: "rgba(74,222,128,0.22)", stroke: "#22c55e", "stroke-width": "0.8", rx: "1" }, svg);
    }
  }

  if (grain === "width")  for (let i = 1; i < 3; i++) se("line", { x1: P, y1: P + RH * i / 3, x2: P + uw, y2: P + RH * i / 3, stroke: "rgba(251,191,36,0.3)", "stroke-width": "0.6", "stroke-dasharray": "2 2" }, svg);
  if (grain === "length") for (let i = 1; i < 3; i++) se("line", { x1: P + RW * i / 3, y1: P, x2: P + RW * i / 3, y2: P + uh, stroke: "rgba(251,191,36,0.3)", "stroke-width": "0.6", "stroke-dasharray": "2 2" }, svg);

  // direction arrow so H-strips vs V-strips are visually distinct in the mini card
  if (s.method === "rect") {
    if (s.primaryDir === "horizontal") {
      // ←→ arrow across the middle of the roll
      const ay = P + RH * 0.5;
      se("line", { x1: P + 4, y1: ay, x2: P + RW - 4, y2: ay, stroke: "rgba(250,204,21,0.55)", "stroke-width": "1.2" }, svg);
      se("polygon", { points: `${P+RW-4},${ay-3} ${P+RW-4},${ay+3} ${P+RW},${ay}`, fill: "rgba(250,204,21,0.55)" }, svg);
      se("polygon", { points: `${P+4},${ay-3} ${P+4},${ay+3} ${P},${ay}`, fill: "rgba(250,204,21,0.55)" }, svg);
    } else {
      // ↕ arrow down the middle of the roll
      const ax = P + RW * 0.5;
      se("line", { x1: ax, y1: P + 4, x2: ax, y2: P + RH - 4, stroke: "rgba(250,204,21,0.55)", "stroke-width": "1.2" }, svg);
      se("polygon", { points: `${ax-3},${P+RH-4} ${ax+3},${P+RH-4} ${ax},${P+RH}`, fill: "rgba(250,204,21,0.55)" }, svg);
      se("polygon", { points: `${ax-3},${P+4} ${ax+3},${P+4} ${ax},${P}`, fill: "rgba(250,204,21,0.55)" }, svg);
    }
  }

  st(`${rollW}"`, { x: P + RW / 2, y: H - 2, "text-anchor": "middle", "font-size": "7" }, svg);
}

// ─── Full detail step renderer 
function drawDetailStep(
  svg: SVGSVGElement, s: ScoredStrategy,
  rollW: number, rollL: number, stepIdx: number
) {
  const W = 600, H = 240, P = 34, RW = W - P * 2, RH = H - P * 2;
  const sx = RW / rollW, sy = RH / rollL;
  svg.innerHTML = "";
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

  // roll bg
  se("rect", { x: P, y: P, width: RW, height: RH, fill: "#12141a", stroke: "#6b7280", "stroke-width": "1.5", rx: "3" }, svg);
  const uw = s.cols * s.cutW * sx, uh = s.rows * s.cutH * sy;
  if (uw < RW) se("rect", { x: P + uw, y: P, width: RW - uw, height: RH, fill: "rgba(220,38,38,0.12)", stroke: "#ef4444", "stroke-width": "0.5", "stroke-dasharray": "5 3" }, svg);
  if (uh < RH) se("rect", { x: P, y: P + uh, width: RW, height: RH - uh, fill: "rgba(220,38,38,0.12)", stroke: "#ef4444", "stroke-width": "0.5", "stroke-dasharray": "5 3" }, svg);

  const diagAng = s.diagType === "corner" ? Math.atan2(s.cutH, s.cutW) * 180 / Math.PI : (s.diagAngle ?? 45);
  const diagRad = diagAng * Math.PI / 180;
  const doff    = Math.min(s.cutH / Math.tan(diagRad), s.cutW);
  const cur     = s.steps[stepIdx] ?? s.steps[0];

  const showDiag = s.method === "diag" && (cur === "Diagonal cuts" || cur === "Done");

  // pieces
  for (let r = 0; r < s.rows; r++) for (let c = 0; c < s.cols; c++) {
    const px = P + c * s.cutW * sx, py = P + r * s.cutH * sy;
    const pw = s.cutW * sx, ph = s.cutH * sy;
    if (showDiag) {
      const op = Math.min(doff * sx, pw);
      const pA = s.ddir === "ltr" ? `${px},${py+ph} ${px+pw},${py+ph} ${px+op},${py}` : `${px},${py+ph} ${px+pw},${py+ph} ${px+pw},${py} ${px+pw-op},${py}`;
      const pB = s.ddir === "ltr" ? `${px},${py} ${px+pw},${py} ${px+op},${py} ${px},${py+ph}` : `${px},${py} ${px+pw-op},${py} ${px},${py+ph}`;
      se("polygon", { points: pA, fill: "rgba(74,222,128,0.3)",  stroke: "#22c55e", "stroke-width": "1" }, svg);
      se("polygon", { points: pB, fill: "rgba(59,130,246,0.22)", stroke: "#3b82f6", "stroke-width": "1" }, svg);
      if (pw > 50 && ph > 28) {
        const n = r * s.cols + c;
        const la = se("text", { fill: "#4ade80", "font-size": "9", "font-family": "'DM Mono',monospace", "text-anchor": "middle", "dominant-baseline": "middle" }, svg);
        const lb = se("text", { fill: "#93c5fd", "font-size": "9", "font-family": "'DM Mono',monospace", "text-anchor": "middle", "dominant-baseline": "middle" }, svg);
        if (s.ddir === "ltr") { la.setAttribute("x", String(px + pw * 0.66)); la.setAttribute("y", String(py + ph * 0.66)); lb.setAttribute("x", String(px + op * 0.3)); lb.setAttribute("y", String(py + ph * 0.3)); }
        else { la.setAttribute("x", String(px + (pw + op) * 0.5)); la.setAttribute("y", String(py + ph * 0.7)); lb.setAttribute("x", String(px + (pw - op) * 0.3)); lb.setAttribute("y", String(py + ph * 0.3)); }
        la.textContent = `A${n * 2 + 1}`; lb.textContent = `B${n * 2 + 2}`;
      }
    } else {
      se("rect", { x: px + 1, y: py + 1, width: pw - 2, height: ph - 2, fill: "rgba(74,222,128,0.18)", stroke: "#22c55e", "stroke-width": "1", rx: "2" }, svg);
      if (pw > 44 && ph > 22) {
        const tn = se("text", { x: px + pw / 2, y: py + ph / 2 - 5, fill: "#4ade80", "font-size": "9", "font-family": "'DM Mono',monospace", "text-anchor": "middle", "dominant-baseline": "middle" }, svg);
        tn.textContent = String(r * s.cols + c + 1);
        const ts = se("text", { x: px + pw / 2, y: py + ph / 2 + 6, fill: "#3d5a3d", "font-size": "8", "font-family": "'DM Mono',monospace", "text-anchor": "middle", "dominant-baseline": "middle" }, svg);
        ts.textContent = `${s.cutW}"×${s.cutH}"`;
      }
    }
  }

  // ── cut direction: unique step labels prevent collision between strategies ──
  const isActiveHCut = cur === "H-cuts first" || cur === "H-cuts next";
  const isActiveVCut = cur === "V-cuts first" || cur === "V-cuts next";
  const showAllCuts  = cur === "Done";

  // Dynamic sizing — scale stroke and labels to available pixel space per row/col
  const rowPx  = s.cutH * sy;   // pixel height of one row
  const colPx  = s.cutW * sx;   // pixel width of one col

  // Stroke width: thinner when rows are tight, never more than 1.5px
  const hStrokeActive = Math.min(1.5, Math.max(0.5, rowPx * 0.08));
  const vStrokeActive = Math.min(1.5, Math.max(0.5, colPx * 0.08));

  // Only show labels when there's enough room (min 10px gap between cuts)
  const showHLabels = rowPx >= 10;
  const showVLabels = colPx >= 10;

  // Font size scales with available space, capped at 8px
  const hFontSize = Math.min(8, Math.max(6, rowPx * 0.55)).toFixed(1);
  const vFontSize = Math.min(8, Math.max(6, colPx * 0.55)).toFixed(1);

  // Dash pattern scales so dashes don't disappear when cuts are dense
  const hDash = rowPx < 6 ? "none" : rowPx < 12 ? "3 2" : "7 3";
  const vDash = colPx < 6 ? "none" : colPx < 12 ? "3 2" : "7 3";

  // draw all vertical cut lines
  for (let c = 1; c <= s.vCuts; c++) {
    const x = P + c * s.cutW * sx;
    const active = isActiveVCut;
    const ln = se("line", {
      x1: x, y1: P, x2: x, y2: P + RH,
      stroke: active || showAllCuts ? "#facc15" : "rgba(250,204,21,0.2)",
      "stroke-width": active ? vStrokeActive : Math.min(0.5, vStrokeActive * 0.4),
      "stroke-dasharray": vDash,
    }, svg);
    if (active) {
      ln.setAttribute("style", "stroke-dasharray:900;animation:dashIn .5s ease-out forwards");
      if (showVLabels) {
        const arrowSize = Math.min(4, colPx * 0.15);
        se("polygon", { points: `${x-arrowSize},${P} ${x+arrowSize},${P} ${x},${P-arrowSize*1.5}`, fill: "#facc15" }, svg);
        const lt = se("text", {
          x: x + arrowSize + 1,
          y: P + Math.min(11, rowPx * 0.5 + 4),
          fill: "#facc15",
          "font-size": vFontSize,
          "font-family": "'DM Mono',monospace",
          "font-weight": "700",
        }, svg);
        lt.textContent = `V${c}`;
      }
    }
  }

  // draw all horizontal cut lines
  for (let r = 1; r <= s.hCuts; r++) {
    const y = P + r * s.cutH * sy;
    const active = isActiveHCut;
    const ln = se("line", {
      x1: P, y1: y, x2: P + RW, y2: y,
      stroke: active || showAllCuts ? "#facc15" : "rgba(250,204,21,0.2)",
      "stroke-width": active ? hStrokeActive : Math.min(0.5, hStrokeActive * 0.4),
      "stroke-dasharray": hDash,
    }, svg);
    if (active) {
      ln.setAttribute("style", "stroke-dasharray:900;animation:dashIn .5s ease-out forwards");
      if (showHLabels) {
        const arrowSize = Math.min(4, rowPx * 0.15);
        se("polygon", { points: `${P-arrowSize*1.5},${y} ${P},${y-arrowSize} ${P},${y+arrowSize}`, fill: "#facc15" }, svg);
        // Place label INSIDE the row below the cut line, offset by a fraction of rowPx
        // This prevents overlap: label sits in the gap between this line and the next
        const labelY = y + Math.max(3, Math.min(rowPx * 0.35, 8));
        const lt = se("text", {
          x: P + arrowSize + 2,
          y: labelY,
          fill: "#facc15",
          "font-size": hFontSize,
          "font-family": "'DM Mono',monospace",
          "font-weight": "700",
          "dominant-baseline": "hanging",
        }, svg);
        lt.textContent = `H${r}`;
      }
    }
  }

  // direction label overlay — shows which way cuts run on "Full roll" step
  if (cur === "Full roll" && s.method === "rect") {
    const arrowY = P + RH / 2;
    const arrowX = P + RW / 2;
    if (s.primaryDir === "horizontal") {
      // ←→ arrows showing horizontal cut direction
      se("line", { x1: P + 10, y1: arrowY, x2: P + RW - 10, y2: arrowY, stroke: "rgba(250,204,21,0.5)", "stroke-width": "1.5", "stroke-dasharray": "4 3" }, svg);
      const lbl = se("text", { x: arrowX, y: arrowY - 10, fill: "rgba(250,204,21,0.8)", "font-size": "10", "font-family": "'DM Mono',monospace", "text-anchor": "middle", "font-weight": "700" }, svg);
      lbl.textContent = "← H-cuts run this way →";
    } else {
      // ↕ arrows showing vertical cut direction
      se("line", { x1: arrowX, y1: P + 10, x2: arrowX, y2: P + RH - 10, stroke: "rgba(250,204,21,0.5)", "stroke-width": "1.5", "stroke-dasharray": "4 3" }, svg);
      const lbl = se("text", { x: arrowX + 10, y: arrowY, fill: "rgba(250,204,21,0.8)", "font-size": "10", "font-family": "'DM Mono',monospace", "text-anchor": "start", "font-weight": "700" }, svg);
      lbl.textContent = "↕ V-cuts first";
    }
  }

  if (cur === "Straight cuts") {
    for (let c = 1; c <= s.vCuts; c++) { const x = P + c * s.cutW * sx; se("line", { x1: x, y1: P, x2: x, y2: P + RH, stroke: "#facc15", "stroke-width": vStrokeActive, "stroke-dasharray": vDash, style: "stroke-dasharray:900;animation:dashIn .5s ease-out forwards" }, svg); }
    for (let r = 1; r <= s.hCuts; r++) { const y = P + r * s.cutH * sy; se("line", { x1: P, y1: y, x2: P + RW, y2: y, stroke: "#facc15", "stroke-width": hStrokeActive, "stroke-dasharray": hDash, style: "stroke-dasharray:900;animation:dashIn .5s ease-out forwards" }, svg); }
  }
  if (cur === "Diagonal cuts") {
    // Diagonal cut length in pixels = hypotenuse of the piece
    const diagPx = Math.sqrt((s.cutW * sx) ** 2 + (s.cutH * sy) ** 2);
    // Scale stroke: thin when pieces are small, max 1.5px
    const diagStroke = Math.min(1.5, Math.max(0.4, diagPx * 0.025));
    const diagDash   = diagPx < 20 ? "none" : diagPx < 40 ? "3 2" : "6 3";
    for (let r = 0; r < s.rows; r++) for (let c = 0; c < s.cols; c++) {
      const px = P + c * s.cutW * sx, py = P + r * s.cutH * sy;
      const pw = s.cutW * sx, ph = s.cutH * sy;
      const op = Math.min(doff * sx, pw);
      const x1 = s.ddir === "ltr" ? px : px + pw, y1 = py + ph;
      const x2 = s.ddir === "ltr" ? px + op : px + pw - op, y2 = py;
      const delay = (r * s.cols + c) * 0.05;
      se("line", { x1, y1, x2, y2, stroke: "#facc15", "stroke-width": diagStroke, "stroke-dasharray": diagDash, style: `stroke-dasharray:900;animation:dashIn .5s ${delay}s ease-out forwards` }, svg);
    }
  }
  if (cur === "Done") {
    const cx = W / 2, cy = H / 2;
    const label = `${s.pieces} pieces ready`;
    // Dark pill background so text is always visible over green fills
    const pillW = label.length * 8.5 + 28, pillH = 32;
    se("rect", {
      x: cx - pillW / 2, y: cy - pillH / 2,
      width: pillW, height: pillH,
      fill: "#0f172a", rx: "16",
      opacity: "0.92",
    }, svg);
    se("rect", {
      x: cx - pillW / 2, y: cy - pillH / 2,
      width: pillW, height: pillH,
      fill: "none", stroke: "#4ade80", "stroke-width": "1.5", rx: "16",
    }, svg);
    const done = se("text", {
      x: cx, y: cy,
      fill: "#4ade80",
      "font-size": "13",
      "font-family": "'DM Mono',monospace",
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      "font-weight": "700",
    }, svg);
    done.textContent = label;
  }

  st(`${rollW}" wide`, { x: P + RW / 2, y: H - 4, "text-anchor": "middle" }, svg);
  st(`${rollL}"`,      { x: W - 4, y: P + RH / 2, "text-anchor": "middle", transform: `rotate(-90,${W - 4},${P + RH / 2})` }, svg);
}

// ── NFP integration helpers ──────────────────────────────────
function simplePartToNestingParts(
  spec: SimplePartSpec,
  fallbackW: number,
  fallbackH: number,
  index: number,
): NestingPart[] {
  const id = `part-${index}`;
  const qty = Math.max(1, spec.quantity || 1);

  switch (spec.partType) {
    case "circle": {
      const d = spec.diameter ?? fallbackW;
      return [{
        id,
        polygon: { id, points: circleToPolygon(d) },
        quantity: qty,
        sourceSpecIndex: index,
        pieceIndex: 0,
        piecesPerUnit: 1,
        renderShape: "circle",
        originalSpec: { diameter: d, label: `Ø${formatInches(d)}"` },
      }];
    }
    case "cylinder": {
      const circumference = spec.diameter ? Math.PI * spec.diameter : fallbackW;
      const h = spec.height ?? fallbackH;
      if (qty > 1) {
        const ratios = normalizeCutRatios(spec.cutRatios, qty);
        return ratios.map((ratio, pieceIndex) => {
      const pieceWidth = isCylinderPanelSplit(spec.cutDirection) ? circumference * ratio : circumference;
      const pieceHeight = isCylinderPanelSplit(spec.cutDirection) ? h : h * ratio;
          const pieceId = `${id}-piece-${pieceIndex}`;
          return {
            id: pieceId,
            polygon: { id: pieceId, points: rectToPolygon(pieceWidth, pieceHeight) },
            quantity: 1,
            sourceSpecIndex: index,
            pieceIndex,
            piecesPerUnit: qty,
            renderShape: "rect",
            originalSpec: {
              width: pieceWidth,
              height: pieceHeight,
              cutDirection: spec.cutDirection,
              label: `${formatInches(pieceWidth)}" × ${formatInches(pieceHeight)}"`,
            },
          };
        });
      }

      return [{
        id,
        polygon: { id, points: rectToPolygon(circumference, h) },
        quantity: qty,
        sourceSpecIndex: index,
        pieceIndex: 0,
        piecesPerUnit: 1,
        renderShape: "rect",
        originalSpec: { width: circumference, height: h, label: `${formatInches(circumference)}" × ${formatInches(h)}"` },
      }];
    }
    case "cone": {
      const innerR = spec.innerRadius ?? Math.max(1, fallbackW / 2);
      const outerR = spec.outerRadius ?? Math.max(2, fallbackH);
      const arc = spec.arcDegrees ?? 120;
      if (qty > 1) {
        const split = buildConeSplitSections(
          innerR,
          outerR,
          arc,
          spec.cutDirection ?? "radial_split",
          spec.cutRatios,
          qty,
        );
        return split.sections.map((section, pieceIndex) => {
          const pieceId = `${id}-piece-${pieceIndex}`;
          return {
            id: pieceId,
            polygon: {
              id: pieceId,
              points: sectorToPolygon(
                section.item.innerRadius ?? innerR,
                section.item.outerRadius ?? outerR,
                section.item.arcDegrees ?? arc,
              ),
            },
            quantity: 1,
            sourceSpecIndex: index,
            pieceIndex,
            piecesPerUnit: qty,
            renderShape: "sector",
            originalSpec: {
              innerRadius: section.item.innerRadius ?? innerR,
              outerRadius: section.item.outerRadius ?? outerR,
              arcDegrees: section.item.arcDegrees ?? arc,
              cutDirection: section.item.cutDirection,
              label: section.label,
            },
          };
        });
      }

      return [{
        id,
        polygon: { id, points: sectorToPolygon(innerR, outerR, arc) },
        quantity: qty,
        sourceSpecIndex: index,
        pieceIndex: 0,
        piecesPerUnit: 1,
        renderShape: "sector",
        originalSpec: { innerRadius: innerR, outerRadius: outerR, arcDegrees: arc, label: `${Math.round(arc)}° sector` },
      }];
    }
    case "trapezoid": {
      const topW = spec.topWidth ?? fallbackW;
      const botW = spec.bottomWidth ?? fallbackW;
      const h = spec.height ?? fallbackH;
      if (qty > 1) {
        const split = buildTrapezoidSplitSections(
          topW,
          botW,
          h,
          spec.cutDirection ?? "vertical_split",
          spec.cutRatios,
          qty,
        );
        return split.sections.map((section, pieceIndex) => {
          const pieceId = `${id}-piece-${pieceIndex}`;
          return {
            id: pieceId,
            polygon: {
              id: pieceId,
              points: trapezoidToPolygon(
                section.item.topWidth ?? topW,
                section.item.bottomWidth ?? botW,
                section.item.height,
              ),
            },
            quantity: 1,
            sourceSpecIndex: index,
            pieceIndex,
            piecesPerUnit: qty,
            renderShape: "trapezoid",
            originalSpec: {
              topWidth: section.item.topWidth ?? topW,
              bottomWidth: section.item.bottomWidth ?? botW,
              height: section.item.height,
              cutDirection: section.item.cutDirection,
              label: section.label,
            },
          };
        });
      }

      return [{
        id,
        polygon: { id, points: trapezoidToPolygon(topW, botW, h) },
        quantity: qty,
        sourceSpecIndex: index,
        pieceIndex: 0,
        piecesPerUnit: 1,
        renderShape: "trapezoid",
        originalSpec: { topWidth: topW, bottomWidth: botW, height: h, label: `${formatInches(topW)}"/${formatInches(botW)}"` },
      }];
    }
    case "rectangle":
    default: {
      const w = spec.width ?? fallbackW;
      const h = spec.length ?? fallbackH;
      return [{
        id,
        polygon: { id, points: rectToPolygon(w, h) },
        quantity: qty,
        sourceSpecIndex: index,
        pieceIndex: 0,
        piecesPerUnit: 1,
        renderShape: "rect",
        originalSpec: { width: w, height: h, label: `${formatInches(w)}"×${formatInches(h)}"` },
      }];
    }
  }
}

function nestingResultToPreviewItems(
  result: NestingResult,
  parts: NestingPart[],
  specs: SimplePartSpec[],
  fallbackW: number,
  fallbackH: number,
): PreviewItem[] {
  const partsById = new Map(parts.map((part) => [part.id, part]));
  return result.placements.map((p) => {
    const partIdBase = p.partId.replace(/-\d+$/, "");
    const np = partsById.get(partIdBase) ?? parts[0];
    const safeIndex = np?.sourceSpecIndex ?? 0;
    const spec = specs[safeIndex] ?? specs[0];
    const rs = np?.renderShape ?? "rect";

    const base: PreviewItem = {
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.height,
      flipped: p.flipped,
      rotation: p.rotation,
      placedPolygon: p.placedPolygon,
      renderShape: rs === "circle" ? "circle"
        : rs === "sector" ? "sector"
        : rs === "trapezoid" ? "trapezoid"
        : "rect",
      label: "",
    };

    if (rs === "circle") {
      base.diameter = spec?.diameter ?? fallbackW;
      base.label = (np?.originalSpec.label as string) ?? `Ø${formatInches(base.diameter)}"`;
    } else if (rs === "sector") {
      base.innerRadius = (np.originalSpec.innerRadius as number) ?? 0;
      base.outerRadius = (np.originalSpec.outerRadius as number) ?? 0;
      base.arcDegrees = (np.originalSpec.arcDegrees as number) ?? 120;
      base.cutDirection = np.originalSpec.cutDirection as SimpleCutDirection | undefined;
      base.label = (np.originalSpec.label as string) ?? `${base.arcDegrees}° sector`;
    } else if (rs === "trapezoid") {
      base.topWidth = (np.originalSpec.topWidth as number) ?? fallbackW;
      base.bottomWidth = (np.originalSpec.bottomWidth as number) ?? fallbackW;
      base.height = (np.originalSpec.height as number) ?? fallbackH;
      base.cutDirection = np.originalSpec.cutDirection as SimpleCutDirection | undefined;
      base.label = (np.originalSpec.label as string)
        ?? `${formatInches(base.topWidth)}"/${formatInches(base.bottomWidth)}"`;
    } else {
      base.cutDirection = np.originalSpec.cutDirection as SimpleCutDirection | undefined;
      base.label = (np.originalSpec.label as string)
        ?? `${formatInches(p.width)}"×${formatInches(p.height)}"`;
    }

    return base;
  });
}

// Main Component
export default function NestingVisualizer({
  defaultRollWidth  = 48,
  defaultRollLength = 96,
  defaultCutWidth   = 24,
  defaultCutHeight  = 12,
  defaultQty        = 6,
  simpleMode        = false,
  simplePart,
  simpleParts,
}: NestingVisualizerProps) {
  const patternSeed = useId().replace(/:/g, "");

  // shared
  const [shape,   setShape]   = useState<ShapeType>("rect");
  const [rollW,   setRollW]   = useState(defaultRollWidth);
  const [rollL,   setRollL]   = useState(defaultRollLength);
  // rect mode
  const [cutW,    setCutW]    = useState(defaultCutWidth);
  const [cutH,    setCutH]    = useState(defaultCutHeight);
  const [qty,     setQty]     = useState(defaultQty);
  const [diagAng, setDiagAng] = useState(45);
  const [ddir,    setDdir]    = useState<DiagDir>("ltr");
  const [grain,   setGrain]   = useState<GrainDir>("none");
  const [activeId,setActiveId]= useState<string>("");
  const [activeStep,setActiveStep]= useState(0);
  const [scored,  setScored]  = useState<ScoredStrategy[]>([]);
  // circle
  const [diam,    setDiam]    = useState(12);
  // cone
  const [innerR,  setInnerR]  = useState(10);
  const [outerR,  setOuterR]  = useState(24);
  const [arcDeg,  setArcDeg]  = useState(120);
  // non-rect stats
  const [bgStats, setBgStats] = useState({ count: 0, used: 0, waste: 100 });
  // view mode for non-rect shapes (stock layout vs profile hero)
  const [viewMode, setViewMode] = useState<"stock" | "profile">("stock");
  // NFP solver state
  const nfpSolverRef = useRef<NFPSolver | null>(null);
  const [optimizedResult, setOptimizedResult] = useState<NestingResult | null>(null);
  const [optimizedItems, setOptimizedItems] = useState<PreviewItem[] | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [nfpError, setNfpError] = useState<string | null>(null);
  const activeSimpleSpecs = useMemo(() => {
    if (simpleParts && simpleParts.length > 0) {
      return simpleParts;
    }

    if (simplePart) {
      return [simplePart];
    }

    return [
      {
        partType: "rectangle" as const,
        quantity: defaultQty,
        width: defaultCutWidth,
        length: defaultCutHeight,
      },
    ];
  }, [simpleParts, simplePart, defaultQty, defaultCutWidth, defaultCutHeight]);
  const baseSimplePreview = useMemo<SimplePartPreview | null>(() => {
    if (!simpleMode) {
      return null;
    }

    return activeSimpleSpecs.length > 1
      ? generateMultiPartPreview(
          defaultRollWidth,
          defaultRollLength,
          activeSimpleSpecs,
          defaultCutWidth,
          defaultCutHeight
        )
      : generateSimplePartPreview(
          defaultRollWidth,
          defaultRollLength,
          activeSimpleSpecs[0],
          defaultCutWidth,
          defaultCutHeight,
          defaultQty
        );
  }, [
    simpleMode,
    activeSimpleSpecs,
    defaultRollWidth,
    defaultRollLength,
    defaultCutWidth,
    defaultCutHeight,
    defaultQty,
  ]);

  useEffect(() => {
    if (!simpleMode) return;
    const containsNonRect = activeSimpleSpecs.some((spec) => spec.partType !== "rectangle");
    if (containsNonRect) {
      setViewMode("stock");
    }
  }, [simpleMode, activeSimpleSpecs]);

  // Clean up solver on unmount
  useEffect(() => {
    return () => {
      nfpSolverRef.current?.cancel();
    };
  }, []);

  const bgSvgRef   = useRef<SVGSVGElement>(null);
  const detailRef  = useRef<SVGSVGElement>(null);
  const miniRefs   = useRef<Record<string, SVGSVGElement>>({});

  // Rect strategy scoring 
  useEffect(() => {
    if (simpleMode || shape !== "rect") return;
    const strats  = getStrategies(cutW, cutH, diagAng, ddir);
    const results = strats.map(s => scoreStrat(s, rollW, rollL, qty, grain));
    results.sort((a, b) => b.score - a.score);
    setScored(results);
    if (!activeId || !results.find(r => r.id === activeId)) {
      setActiveId(results[0]?.id ?? "");
      setActiveStep(0);
    }
  }, [shape, rollW, rollL, cutW, cutH, qty, diagAng, ddir, grain]);

  // Draw mini roll previews (rect) 
  useEffect(() => {
    if (simpleMode || shape !== "rect") return;
    scored.forEach(s => {
      const svg = miniRefs.current[s.id];
      if (svg) drawMiniRoll(svg, s, rollW, rollL, grain);
    });
  }, [scored, shape, grain, rollW, rollL]);

  // Draw detail step 
  useEffect(() => {
    if (simpleMode || shape !== "rect") return;
    const active = scored.find(s => s.id === activeId);
    if (!active || !detailRef.current) return;
    drawDetailStep(detailRef.current, active, rollW, rollL, activeStep);
  }, [scored, activeId, activeStep, shape, rollW, rollL]);

  // ── Non-rect render 
  const renderBg = useCallback(() => {
    const svg = bgSvgRef.current;
    if (simpleMode || !svg || shape === "rect") return;
    const SVG_W = 680, SVG_H = 310, PAD = 44;
    const RW2 = SVG_W - PAD * 2, RH2 = SVG_H - PAD * 2;
    svg.innerHTML = "";

    const defs = se("defs");
    const p1 = se("pattern", { id: "ph2", width: "14", height: "14", patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
    p1.appendChild(se("line", { x1: "0", y1: "0", x2: "0", y2: "14", stroke: "#1e2230", "stroke-width": "1" }));
    const p2 = se("pattern", { id: "pu2", width: "10", height: "10", patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
    p2.appendChild(se("line", { x1: "0", y1: "0", x2: "0", y2: "10", stroke: "rgba(74,222,128,0.4)", "stroke-width": "1.3" }));
    const p3 = se("pattern", { id: "ps2", width: "10", height: "10", patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
    p3.appendChild(se("line", { x1: "0", y1: "0", x2: "0", y2: "10", stroke: "rgba(220,38,38,0.5)", "stroke-width": "1.3" }));
    const clip = se("clipPath", { id: "rollClip2" });
    clip.appendChild(se("rect", { x: PAD, y: PAD, width: RW2, height: RH2, rx: "4" }));
    [p1, p2, p3, clip].forEach(e => defs.appendChild(e));
    svg.appendChild(defs);

    const g = se("g"); svg.appendChild(g);
    g.appendChild(se("rect", { x: PAD, y: PAD, width: RW2, height: RH2, fill: "url(#ph2)", rx: "4" }));
    g.appendChild(se("rect", { x: PAD, y: PAD, width: RW2, height: RH2, fill: "none", stroke: "#6b7280", "stroke-width": "1.5", rx: "4" }));

    let ns2 = { count: 0, used: 0, waste: 100 };

    if (shape === "circle") {
      const scale = Math.min(RW2 / rollW, RH2 / rollL);
      const r = (diam / 2) * scale;
      if (r > 0) {
        const D = r * 2; const circles: { cx: number; cy: number }[] = [];
        for (let row = 0; ; row++) {
          const off = row % 2 === 1 ? r * 0.866 : 0, cy2 = PAD + r + row * D * 0.866;
          if (cy2 - r > PAD + RH2) break;
          for (let c = 0; ; c++) {
            const cx2 = PAD + r + c * D + off;
            if (cx2 - r > PAD + RW2) break;
            if (cx2 + r <= PAD + RW2 + 2 && cy2 + r <= PAD + RH2 + 2) circles.push({ cx: cx2, cy: cy2 });
          }
        }
        const clipG = se("g", { "clip-path": "url(#rollClip2)" });
        circles.forEach(({ cx, cy }, i) => {
          clipG.appendChild(se("circle", { cx, cy, r: r - 1, fill: "url(#pu2)", stroke: "#22c55e", "stroke-width": "1.5" }));
          if (r > 18) st(`⌀${diam}"`, { x: cx, y: cy, fill: i === 0 ? "#e2e8f0" : "#7dd3a8", "font-size": "9", "text-anchor": "middle", "dominant-baseline": "middle" }, clipG);
        });
        g.appendChild(clipG);
        st("Hex packing · interstitial gaps = scrap", { x: PAD + RW2 / 2, y: PAD + RH2 - 6, fill: "#f87171", "font-size": "9", "text-anchor": "middle" }, g);
        st(`${circles.length} circles · ⌀${diam}" each`, { x: PAD + RW2, y: PAD - 8, fill: "#4ade80", "font-size": "10", "text-anchor": "end", "font-weight": "700" }, g);
        ns2 = { count: circles.length, used: 90.7, waste: 9.3 };
      }
    } else {
      const arcRad = (arcDeg * Math.PI) / 180;
      const scale  = Math.min(RW2 / (outerR * 2), RH2 / (outerR * 2)) * 0.85;
      const sIn = innerR * scale, sOut = outerR * scale;
      const pieceW = sOut * 2, pieceH = sOut;
      const arcPath = (cx: number, cy: number, flipped: boolean) => {
        const base = flipped ? Math.PI / 2 : -Math.PI / 2, a1 = base - arcRad / 2, a2 = base + arcRad / 2;
        const x1o = cx + sOut * Math.cos(a1), y1o = cy + sOut * Math.sin(a1);
        const x2o = cx + sOut * Math.cos(a2), y2o = cy + sOut * Math.sin(a2);
        const x1i = cx + sIn * Math.cos(a2),  y1i = cy + sIn * Math.sin(a2);
        const x2i = cx + sIn * Math.cos(a1),  y2i = cy + sIn * Math.sin(a1);
        const lg = arcDeg > 180 ? 1 : 0;
        return `M${x1o} ${y1o} A${sOut} ${sOut} 0 ${lg} 1 ${x2o} ${y2o} L${x1i} ${y1i} A${sIn} ${sIn} 0 ${lg} 0 ${x2i} ${y2i} Z`;
      };
      const cols2 = Math.max(1, Math.floor(RW2 / (pieceW * 0.7)));
      const rows2 = Math.max(1, Math.floor(RH2 / (pieceH * 0.88)));
      const pieces: { cx: number; cy: number; flipped: boolean }[] = [];
      for (let row = 0; row < rows2; row++) for (let col = 0; col < cols2; col++) {
        const flipped = (row + col) % 2 === 1, cx = PAD + col * (pieceW * 0.7) + sOut, cy = PAD + row * (pieceH * 0.88) + sOut * 0.55;
        if (cx + sOut < PAD + RW2 + 12 && cy + sOut < PAD + RH2 + 12) pieces.push({ cx, cy, flipped });
      }
      const clipG = se("g", { "clip-path": "url(#rollClip2)" });
      pieces.forEach(({ cx, cy, flipped }, i) => clipG.appendChild(se("path", { d: arcPath(cx, cy, flipped), fill: "url(#pu2)", stroke: "#22c55e", "stroke-width": "1.5", opacity: i === 0 ? "1" : "0.85" })));
      g.appendChild(clipG);
      if (pieces.length > 0) {
        const { cx, cy } = pieces[0];
        g.appendChild(se("line", { x1: cx, y1: cy, x2: cx + sIn * 0.72, y2: cy - sIn * 0.72, stroke: "#64748b", "stroke-width": "1", "stroke-dasharray": "3 2" }));
        st(`R${innerR}"`, { x: cx + sIn * 0.78, y: cy - sIn * 0.76, fill: "#64748b", "font-size": "9" }, g);
        g.appendChild(se("line", { x1: cx, y1: cy, x2: cx + sOut * 0.72, y2: cy - sOut * 0.72, stroke: "#4ade80", "stroke-width": "1", "stroke-dasharray": "3 2" }));
        st(`R${outerR}"`, { x: cx + sOut * 0.78, y: cy - sOut * 0.76, fill: "#4ade80", "font-size": "9" }, g);
      }
      st("Alternating orientation packing · corner gaps = scrap", { x: PAD + RW2 / 2, y: PAD + RH2 - 6, fill: "#f87171", "font-size": "9", "text-anchor": "middle" }, g);
      st(`${pieces.length} arcs · ${arcDeg}° sweep`, { x: PAD + RW2, y: PAD - 8, fill: "#4ade80", "font-size": "10", "text-anchor": "end", "font-weight": "700" }, g);
      const arcArea = (arcDeg / 360) * Math.PI * (outerR ** 2 - innerR ** 2), rollArea = rollW * rollL;
      ns2 = { count: pieces.length, used: Math.min(99, (pieces.length * arcArea / rollArea) * 100), waste: 0 };
      ns2.waste = 100 - ns2.used;
    }
    setBgStats(ns2);
  }, [arcDeg, diam, innerR, outerR, rollL, rollW, shape, simpleMode]);

  useEffect(() => { renderBg(); }, [renderBg]);

  // Step notes 
  const activeStrat = scored.find(s => s.id === activeId);
  const stepNote = (() => {
    if (!activeStrat) return "";
    const cur = activeStrat.steps[activeStep];
    const totalDiagCuts = activeStrat.method === "diag" ? activeStrat.rects : 0;
    const diagAn = activeStrat.diagType === "corner" ? Math.atan2(activeStrat.cutH, activeStrat.cutW) * 180 / Math.PI : (activeStrat.diagAngle ?? 45);
    const map: Record<string, string> = {
      "Full roll":       `Roll is ${rollW}"×${rollL}". ${activeStrat.cols} cols × ${activeStrat.rows} rows = ${activeStrat.method === "diag" ? activeStrat.rects * 2 + " triangles" : activeStrat.rects + " rectangles"} of ${activeStrat.cutW}"×${activeStrat.cutH}".`,
      "H-cuts first":   `Make ${activeStrat.hCuts} horizontal cut${activeStrat.hCuts !== 1 ? "s" : ""} every ${activeStrat.cutH}" — runs ←→ across roll width. This is the primary cut direction.`,
      "V-cuts next":    `Make ${activeStrat.vCuts} vertical cut${activeStrat.vCuts !== 1 ? "s" : ""} every ${activeStrat.cutW}" — runs ↕ down the roll.`,
      "V-cuts first":   `Make ${activeStrat.vCuts} vertical cut${activeStrat.vCuts !== 1 ? "s" : ""} every ${activeStrat.cutW}" — runs ↕ down roll length. This is the primary cut direction.`,
      "H-cuts next":    `Make ${activeStrat.hCuts} horizontal cut${activeStrat.hCuts !== 1 ? "s" : ""} every ${activeStrat.cutH}" — runs ←→ across the roll width.`,
      "Straight cuts":  `${activeStrat.hCuts} horizontal + ${activeStrat.vCuts} vertical cuts to create ${activeStrat.rects} rectangles before the diagonal.`,
      "Diagonal cuts":  `Diagonal cut each rectangle ${activeStrat.ddir === "ltr" ? "╱ left-to-right" : "╲ right-to-left"} at ${diagAn.toFixed(1)}°. Yields triangle A (green) + B (blue) — both kept.`,
      "Done":           `All cuts done. ${activeStrat.pieces} pieces ready.${activeStrat.pieces < qty ? " Note: second roll needed." : ""}`,
    };
    return map[cur] ?? "";
  })();

  // ── NFP background optimizer ──────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const nfpInputKey = useMemo(() => JSON.stringify({
    rw: defaultRollWidth, rl: defaultRollLength,
    sp: activeSimpleSpecs,
    cw: defaultCutWidth, ch: defaultCutHeight, q: defaultQty,
  }), [defaultRollWidth, defaultRollLength, activeSimpleSpecs, defaultCutWidth, defaultCutHeight, defaultQty]);

  useEffect(() => {
    if (!simpleMode) return;
    // Reset on any param change
    setOptimizedResult(null);
    setOptimizedItems(null);
    setIsOptimizing(false);
    setNfpError(null);

    if (!shouldAutoOptimizeInteractiveLayout(activeSimpleSpecs)) {
      return;
    }

    const nestingParts: NestingPart[] = activeSimpleSpecs.flatMap((spec, i) =>
      simplePartToNestingParts(spec, defaultCutWidth, defaultCutHeight, i),
    );

    const totalRequestedPieces = nestingParts.reduce((sum, part) => sum + part.quantity, 0);
    const generations = totalRequestedPieces > 16 ? 10 : totalRequestedPieces > 8 ? 14 : 18;
    const populationSize = totalRequestedPieces > 16 ? 4 : totalRequestedPieces > 8 ? 6 : 8;

    const input: NestingInput = {
      binWidth: defaultRollWidth,
      binHeight: defaultRollLength,
      parts: nestingParts,
      spacing: 0.125,
      rotationSteps: 4,
      generations,
      populationSize,
      mutationRate: 0.2,
    };

    if (!nfpSolverRef.current) {
      nfpSolverRef.current = new NFPSolver();
    }

    let cancel: (() => void) | null = null;
    const timer = window.setTimeout(() => {
      setIsOptimizing(true);
      cancel = nfpSolverRef.current!.solve(input, {
        onComplete: (result) => {
          const items = nestingResultToPreviewItems(result, nestingParts, activeSimpleSpecs, defaultCutWidth, defaultCutHeight);
          setOptimizedResult(result);
          setOptimizedItems(items.length > 0 ? items : null);
          setIsOptimizing(false);
        },
        onError: (msg) => {
          console.error("[NFP] Solver error:", msg);
          setNfpError(msg);
          setOptimizedResult(null);
          setOptimizedItems(null);
          setIsOptimizing(false);
        },
      });
    }, 220);

    return () => {
      window.clearTimeout(timer);
      cancel?.();
        setIsOptimizing(false);
    };
    // nfpInputKey serializes all relevant params; no need to list them individually
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nfpInputKey, simpleMode, activeSimpleSpecs, defaultCutWidth, defaultCutHeight, defaultQty, defaultRollLength, defaultRollWidth]);

  if (simpleMode) {
    const previewRollW = defaultRollWidth;
    const previewRollL = defaultRollLength;
    const activeSimpleParts = activeSimpleSpecs;
    const preview = baseSimplePreview ?? generateSimplePartPreview(
      previewRollW,
      previewRollL,
      activeSimpleParts[0],
      defaultCutWidth,
      defaultCutHeight,
      defaultQty
    );
    const isNonRect = preview.renderShape !== "rect";
    const shapeFirstView = false;
    const showSingleHeroProfile = false;
    const hasOptimizedStockLayout = viewMode === "stock"
      && optimizedResult !== null
      && optimizedItems !== null
      && optimizedItems.length > 0;
    let displayPreview: SimplePartPreview = preview;
    let optimizedStockPreview: SimplePartPreview | null = null;
    if (hasOptimizedStockLayout && optimizedResult && optimizedItems) {
      optimizedStockPreview = buildOptimizedStockPreview(preview, optimizedResult, optimizedItems, previewRollW, previewRollL);
      if (compareStockLayoutPreviews(optimizedStockPreview, preview) < 0) {
        displayPreview = optimizedStockPreview;
      }
    }
    const usingOptimizedStockLayout = optimizedStockPreview !== null && displayPreview === optimizedStockPreview;
    const fabScore = computeFabricationScore(displayPreview, previewRollW, previewRollL);
    const stockSqFt = (previewRollW * previewRollL) / 144;
    const usedSqFt = displayPreview.usedArea / 144;
    const reusableOffcutSqFt = displayPreview.reusableArea / 144;
    const scrapSqFt = displayPreview.scrapArea / 144;
    const reusableOffcutPct = stockSqFt > 0 ? (reusableOffcutSqFt / stockSqFt) * 100 : 0;
    const scrapPct = stockSqFt > 0 ? (scrapSqFt / stockSqFt) * 100 : 0;
    const layoutNote = usingOptimizedStockLayout
      ? `${displayPreview.strategyNote} Optimized placements and metrics are shown in stock layout.`
      : displayPreview.strategyNote;
    const displayItems = displayPreview.items;
    const isOptimizedResult = usingOptimizedStockLayout;
    const previewBounds = getPlacementBounds(displayItems);
    const viewWidth = 980;
    const viewHeight = 560;
    const padLeft = 74;
    const padRight = 112;
    const padTop = 82;
    const padBottom = 80;
    const drawWidth = viewWidth - padLeft - padRight;
    const drawHeight = viewHeight - padTop - padBottom;
    const heroPadX = shapeFirstView ? Math.max(previewBounds.occupiedWidth * 0.12, 1.5) : 0;
    const heroPadY = shapeFirstView ? Math.max(previewBounds.occupiedHeight * 0.12, 1.5) : 0;
    const canvasUnitsW = shapeFirstView ? Math.max(previewBounds.occupiedWidth + heroPadX * 2, 1) : previewRollW;
    const canvasUnitsH = shapeFirstView ? Math.max(previewBounds.occupiedHeight + heroPadY * 2, 1) : previewRollL;
    const unitOriginX = shapeFirstView ? previewBounds.minX - heroPadX : 0;
    const unitOriginY = shapeFirstView ? previewBounds.minY - heroPadY : 0;
    const scale = Math.min(drawWidth / canvasUnitsW, drawHeight / canvasUnitsH);
    const surfacePxW = canvasUnitsW * scale;
    const surfacePxH = canvasUnitsH * scale;
    const surfaceX = padLeft + (drawWidth - surfacePxW) / 2;
    const surfaceY = padTop + (drawHeight - surfacePxH) / 2;
    const stockPatternId = `stock-${patternSeed}`;
    const offcutPatternId = `offcut-${patternSeed}`;
    const wastePatternId = `waste-${patternSeed}`;
    const usablePatternId = `usable-${patternSeed}`;
    const markerId = `arrow-${patternSeed}`;
    const rowLabelY = surfaceY + surfacePxH + 50;
    const colLabelX = surfaceX + surfacePxW + 50;
    const metricsAreEstimatedFromStock = false;
    const requestedCutPieceCount = displayPreview.requestedUnits * Math.max(displayPreview.piecesPerUnit, 1);
    const isSplitStockPreview = displayPreview.renderShape !== "rect" && displayPreview.piecesPerUnit > 1;
    const missingCutPieceCount = Math.max(0, requestedCutPieceCount - displayPreview.piecesShown);
    const pieceCountLabel = displayPreview.renderShape === "rect" || displayPreview.piecesPerUnit > 1
      ? (isSplitStockPreview ? "Cut pieces placed" : "Cut pieces")
      : "Profiles placed";
    const reusableMetricLabel = "Reusable offcut";
    const scrapMetricLabel = "Waste";
    const pieceCountValue = isSplitStockPreview
      ? `${displayPreview.piecesShown}/${requestedCutPieceCount}`
      : `${displayPreview.piecesShown}`;
    const previewTitle = isSplitStockPreview
      ? `${displayPreview.strategyName} • ${displayPreview.requestedUnits} finished profile${displayPreview.requestedUnits === 1 ? "" : "s"} / ${requestedCutPieceCount} cut section${requestedCutPieceCount === 1 ? "" : "s"}`
      : `${displayPreview.strategyName} • ${displayPreview.requestedUnits} part${displayPreview.requestedUnits === 1 ? "" : "s"} requested`;
    const localBlankX = surfaceX + (previewBounds.minX - unitOriginX) * scale;
    const localBlankY = surfaceY + (previewBounds.minY - unitOriginY) * scale;
    const localBlankW = previewBounds.occupiedWidth * scale;
    const localBlankH = previewBounds.occupiedHeight * scale;
    const showOffcutLabel = !shapeFirstView && displayPreview.wasteMode === "bands" && displayPreview.offcutBands.length > 0;
    const offcutLabelBands = showOffcutLabel
      ? [...displayPreview.offcutBands]
        .sort((a, b) => (b.width * b.height) - (a.width * a.height))
        .filter((band) => band.width * scale > 42 && band.height * scale > 14)
      : [];
    const showCutPlan = displayPreview.renderShape !== "rect";

    return (
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border bg-[#1b1b19] px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-sm font-semibold text-stone-50">
                {"Rubber Sheet Nesting Layout"}
              </div>
              <div className="text-xs text-stone-300">
                {previewTitle}
              </div>
              <div className="mt-1 text-xs text-stone-400">
                {layoutNote}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1 font-medium text-sky-300">
                Profile: {displayPreview.strategyName}
              </span>
              <span className="rounded-full border border-green-500/40 bg-green-500/10 px-3 py-1 font-medium text-green-600">
                {pieceCountLabel}: {pieceCountValue}
              </span>
              {reusableOffcutSqFt > 0 && (
                <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 font-medium text-amber-600">
                  {reusableMetricLabel}: {reusableOffcutPct.toFixed(1)}%
                </span>
              )}
              <span className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 font-medium text-red-600">
                {scrapMetricLabel}: {scrapPct.toFixed(1)}%
              </span>
              {displayPreview.overflowUnits > 0 && (
                <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 font-medium text-amber-600">
                  {isSplitStockPreview
                    ? `+${missingCutPieceCount} cut piece${missingCutPieceCount === 1 ? "" : "s"} need another sheet`
                    : `+${displayPreview.overflowUnits} part${displayPreview.overflowUnits === 1 ? "" : "s"} need another sheet`}
                </span>
              )}
              {isOptimizedResult && (
                <span className="rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-1 font-medium text-violet-300">
                  NFP Optimized
                </span>
              )}
              {isOptimizing && !isOptimizedResult && (
                <span className="rounded-full border border-stone-500/40 bg-stone-500/10 px-3 py-1 font-medium text-stone-400 animate-pulse">
                  Optimizing...
                </span>
              )}
              {nfpError && (
                <span className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 font-medium text-red-400" title={nfpError}>
                  NFP Error
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto bg-[#232320] px-2 py-4 sm:px-4">
          <svg
            viewBox={`0 0 ${viewWidth} ${viewHeight}`}
            className="mx-auto block w-full max-w-6xl rounded-xl"
          >
            <defs>
              <pattern
                id={stockPatternId}
                width="18"
                height="18"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="18" height="18" fill="#242420" />
                <line x1="0" y1="0" x2="0" y2="18" stroke="rgba(120,113,108,0.22)" strokeWidth="1.5" />
              </pattern>
              <pattern
                id={offcutPatternId}
                width="14"
                height="14"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="14" height="14" fill="#332c1f" />
                <line x1="0" y1="0" x2="0" y2="14" stroke="rgba(245,158,11,0.5)" strokeWidth="2" />
              </pattern>
              <pattern
                id={wastePatternId}
                width="14"
                height="14"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="14" height="14" fill="#312726" />
                <line x1="0" y1="0" x2="0" y2="14" stroke="rgba(239,68,68,0.5)" strokeWidth="2" />
              </pattern>
              <pattern
                id={usablePatternId}
                width="18"
                height="18"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(-32)"
              >
                <rect width="18" height="18" fill="#2f3426" />
                <line x1="0" y1="0" x2="0" y2="18" stroke="rgba(132,204,22,0.45)" strokeWidth="2" />
              </pattern>
              <marker
                id={markerId}
                markerWidth="8"
                markerHeight="8"
                refX="4"
                refY="4"
                orient="auto"
              >
                <path d="M0,0 L8,4 L0,8 Z" fill="#d6d3d1" />
              </marker>
            </defs>

            <text x={viewWidth / 2} y="34" textAnchor="middle" fill="#ffffff" fontSize="20" fontWeight="700">
              {"Rubber Sheet Nesting Layout"}
            </text>
            <text x={viewWidth / 2} y="60" textAnchor="middle" fill="#f5f5f4" fontSize="12">
              {`Typical ${formatInches(previewRollW)}" × ${formatInches(previewRollL)}" stock sheet`}
            </text>

            <rect
              x={surfaceX}
              y={surfaceY}
              width={surfacePxW}
              height={surfacePxH}
              rx="8"
              fill={`url(#${stockPatternId})`}
              stroke="#d6d3d1"
              strokeWidth="2"
            />

            {!shapeFirstView && displayPreview.offcutBands.map((band, index) => (
              <rect
                key={`band-${index + 1}`}
                x={surfaceX + band.x * scale}
                y={surfaceY + band.y * scale}
                width={band.width * scale}
                height={band.height * scale}
                fill={`url(#${offcutPatternId})`}
                opacity="0.95"
              />
            ))}

            {!shapeFirstView && displayPreview.scrapBands.map((band, index) => (
              <rect
                key={`scrap-band-${index + 1}`}
                x={surfaceX + band.x * scale}
                y={surfaceY + band.y * scale}
                width={band.width * scale}
                height={band.height * scale}
                fill={`url(#${wastePatternId})`}
                opacity="0.95"
              />
            ))}

            {displayItems.map((item, index) => {
              const x = surfaceX + (item.x - unitOriginX) * scale;
              const y = surfaceY + (item.y - unitOriginY) * scale;
              const width = item.width * scale;
              const height = item.height * scale;
              const showShapeHeroAnnotations = shapeFirstView;
              const showCutLines = shapeFirstView && (displayPreview.sections?.length ?? preview.piecesPerUnit) > 1;
              const showLocalBlankGeometry = shapeFirstView && item.renderShape !== "rect" && width > 54 && height > 54;
              const showBadge = !shapeFirstView && !showCutLines && width > 64 && height > 30;
              const showDims = width > 90 && height > 40;
              const splitLabel = item.renderShape === "sector" && item.label.includes("•")
                ? item.label.split("•").map((part) => part.trim())
                : item.renderShape === "trapezoid" && item.label.includes(" × ")
                  ? item.label.split(" × ").map((part, partIndex) => (partIndex === 0 ? part.trim() : `× ${part.trim()}`))
                  : null;
              const badgeX = x + Math.min(12, Math.max(8, width * 0.08));
              const badgeY = y + Math.min(12, Math.max(8, height * 0.08));
              const badgeCenterX = badgeX + 28;
              const badgeCenterY = badgeY + 14;
              const dimY = item.renderShape === "circle"
                ? y + height / 2 + 36
                : item.renderShape === "sector"
                  ? y + height / 2 + 14
                  : y + height / 2 + 10;
              const heroCutBreakpoints = showCutLines
                ? (preview.cutBreakpoints && preview.cutBreakpoints.length === preview.piecesPerUnit - 1
                    ? preview.cutBreakpoints
                    : buildCutBreakpoints(normalizeCutRatios(preview.cutRatios, preview.piecesPerUnit)))
                : [];
              const heroSectionBounds = [0, ...heroCutBreakpoints, 1];
              const heroSectionLabels = preview.cutLabels ?? [];

              const renderShape = () => {
                // NFP-optimized items with non-zero rotation: render pre-computed
                // polygon directly (the canonical shape rendering assumes 0° orientation)
                if (item.placedPolygon && item.placedPolygon.length > 2
                    && item.rotation && Math.abs(item.rotation) > 0.01) {
                  const polyPoints = item.placedPolygon
                    .map((pt) => {
                      const px = surfaceX + (pt.x - unitOriginX) * scale;
                      const py = surfaceY + (pt.y - unitOriginY) * scale;
                      return `${px},${py}`;
                    })
                    .join(" ");
                  return (
                    <>
                      <polygon
                        points={polyPoints}
                        fill={`url(#${usablePatternId})`}
                        stroke="#f5f5f4"
                        strokeWidth="2"
                      />
                    </>
                  );
                }

                if (item.renderShape === "circle") {
                  const radiusPx = ((item.diameter ?? item.width) / 2) * scale;
                  const cx = x + width / 2;
                  const cy = y + height / 2;
                  const circlePath = [
                    `M ${cx - Math.max(radiusPx - 2, 0)} ${cy}`,
                    `A ${Math.max(radiusPx - 2, 0)} ${Math.max(radiusPx - 2, 0)} 0 1 0 ${cx + Math.max(radiusPx - 2, 0)} ${cy}`,
                    `A ${Math.max(radiusPx - 2, 0)} ${Math.max(radiusPx - 2, 0)} 0 1 0 ${cx - Math.max(radiusPx - 2, 0)} ${cy}`,
                    "Z",
                  ].join(" ");
                  const blankPath = `M ${x} ${y} H ${x + width} V ${y + height} H ${x} Z`;
                  return (
                    <>
                      {!shapeFirstView && (
                        <path
                          d={`${blankPath} ${circlePath}`}
                          fill={`url(#${wastePatternId})`}
                          fillRule="evenodd"
                          opacity="0.92"
                        />
                      )}
                      {showShapeHeroAnnotations && (
                        <>
                          <text
                            x={cx}
                            y={Math.max(y - 12, 18)}
                            textAnchor="middle"
                            fill="#cbd5e1"
                            fontSize="12"
                            fontWeight="600"
                          >
                            Finished circle Ø{formatInches(item.diameter ?? item.width)}"
                          </text>
                          <text
                            x={cx}
                            y={Math.min(y + height + 18, viewHeight - 18)}
                            textAnchor="middle"
                            fill="#e7e5e4"
                            fontSize="12"
                            fontWeight="600"
                          >
                            {preview.piecesPerUnit > 1
                              ? `${preview.piecesPerUnit} radial cut section${preview.piecesPerUnit === 1 ? "" : "s"}`
                              : "Single-profile outside cut"}
                          </text>
                        </>
                      )}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={Math.max(radiusPx - 2, 0)}
                        fill={`url(#${usablePatternId})`}
                        stroke="#f5f5f4"
                        strokeWidth="2"
                      />
                      <circle
                        cx={cx}
                        cy={cy}
                        r={Math.max(radiusPx - 2, 0)}
                        fill="none"
                        stroke="rgba(255,255,255,0.18)"
                        strokeWidth="1"
                        strokeDasharray="6 4"
                      />
                      <line
                        x1={cx - radiusPx + 4}
                        y1={cy}
                        x2={cx + radiusPx - 4}
                        y2={cy}
                        stroke="rgba(255,255,255,0.24)"
                        strokeWidth="1"
                        strokeDasharray="6 4"
                      />
                      <line
                        x1={cx}
                        y1={cy - radiusPx + 4}
                        x2={cx}
                        y2={cy + radiusPx - 4}
                        stroke="rgba(255,255,255,0.24)"
                        strokeWidth="1"
                        strokeDasharray="6 4"
                      />
                      <line
                        x1={cx}
                        y1={cy}
                        x2={cx + Math.cos(-Math.PI / 4) * (radiusPx - 8)}
                        y2={cy + Math.sin(-Math.PI / 4) * (radiusPx - 8)}
                        stroke="rgba(255,255,255,0.28)"
                        strokeWidth="1.5"
                      />
                      <circle cx={cx} cy={cy} r="2.5" fill="#f8fafc" opacity="0.9" />
                      <text
                        x={cx + radiusPx * 0.34}
                        y={cy - radiusPx * 0.24}
                        textAnchor="middle"
                        fill="#f5f5f4"
                        fontSize="13"
                        fontWeight="600"
                      >
                        R{formatInches((item.diameter ?? item.width) / 2)}"
                      </text>
                      {showShapeHeroAnnotations && preview.piecesPerUnit > 1 && Array.from({ length: preview.piecesPerUnit }, (_, segmentIndex) => {
                        const angle = (-Math.PI / 2) + ((Math.PI * 2 * segmentIndex) / preview.piecesPerUnit);
                        return (
                          <line
                            key={`circle-cut-${segmentIndex + 1}`}
                            x1={cx}
                            y1={cy}
                            x2={cx + Math.cos(angle) * (radiusPx - 4)}
                            y2={cy + Math.sin(angle) * (radiusPx - 4)}
                            stroke="rgba(248,250,252,0.6)"
                            strokeWidth="1.6"
                            strokeDasharray="8 5"
                          />
                        );
                      })}
                    </>
                  );
                }

                if (item.renderShape === "trapezoid") {
                  const boxWidth = item.width;
                  const trapezoidTopWidth = item.flipped ? item.bottomWidth : item.topWidth;
                  const trapezoidBottomWidth = item.flipped ? item.topWidth : item.bottomWidth;
                  const cutDirection = item.cutDirection ?? preview.cutDirection ?? "vertical_split";
                  const topInset = ((boxWidth - (trapezoidTopWidth ?? boxWidth)) / 2) * scale;
                  const bottomInset = ((boxWidth - (trapezoidBottomWidth ?? boxWidth)) / 2) * scale;
                  const trapezoidPath = [
                    `M ${x + bottomInset} ${y + height - 2}`,
                    `L ${x + width - bottomInset} ${y + height - 2}`,
                    `L ${x + width - topInset} ${y + 2}`,
                    `L ${x + topInset} ${y + 2}`,
                    "Z",
                  ].join(" ");
                  const blankPath = `M ${x} ${y} H ${x + width} V ${y + height} H ${x} Z`;
                  return (
                    <>
                      {!shapeFirstView && (
                        <path
                          d={`${blankPath} ${trapezoidPath}`}
                          fill={`url(#${wastePatternId})`}
                          fillRule="evenodd"
                          opacity="0.92"
                        />
                      )}
                      {showLocalBlankGeometry && (
                        <>
                          <rect
                            x={x}
                            y={y}
                            width={width}
                            height={height}
                            fill="none"
                            stroke="rgba(125,211,252,0.82)"
                            strokeWidth="1.5"
                            strokeDasharray="8 6"
                          />
                          <text
                            x={x + width / 2}
                            y={Math.max(y - 12, 18)}
                            textAnchor="middle"
                            fill="#cbd5e1"
                            fontSize="12"
                            fontWeight="600"
                          >
                            Rough blank {formatInches(boxWidth)}" × {formatInches(item.height)}"
                          </text>
                          <text
                            x={x + width / 2}
                            y={Math.min(y + height + 18, viewHeight - 18)}
                            textAnchor="middle"
                            fill="#e7e5e4"
                            fontSize="12"
                            fontWeight="600"
                          >
                            Finished panel {formatInches(trapezoidTopWidth ?? boxWidth)}" / {formatInches(trapezoidBottomWidth ?? boxWidth)}"
                          </text>
                        </>
                      )}
                      <polygon
                        points={[
                          `${x + bottomInset},${y + height - 2}`,
                          `${x + width - bottomInset},${y + height - 2}`,
                          `${x + width - topInset},${y + 2}`,
                          `${x + topInset},${y + 2}`,
                        ].join(" ")}
                        fill={`url(#${usablePatternId})`}
                        stroke="#f5f5f4"
                        strokeWidth="2"
                      />
                      <line
                        x1={x + topInset}
                        y1={y + 2}
                        x2={x + bottomInset}
                        y2={y + height - 2}
                        stroke="rgba(255,255,255,0.18)"
                        strokeWidth="1"
                        strokeDasharray="6 4"
                      />
                      <line
                        x1={x + width - topInset}
                        y1={y + 2}
                        x2={x + width - bottomInset}
                        y2={y + height - 2}
                        stroke="rgba(255,255,255,0.18)"
                        strokeWidth="1"
                        strokeDasharray="6 4"
                      />
                      {showCutLines && (
                        isTrapezoidVerticalSplit(cutDirection)
                          ? heroCutBreakpoints.map((t, sectionIndex) => {
                              const topX = x + topInset + ((width - topInset * 2) * t);
                              const bottomX = x + bottomInset + ((width - bottomInset * 2) * t);
                              return (
                                <line
                                  key={`trap-cut-${sectionIndex + 1}`}
                                  x1={topX}
                                  y1={y + 2}
                                  x2={bottomX}
                                  y2={y + height - 2}
                                  stroke="rgba(248,250,252,0.72)"
                                  strokeWidth="1.6"
                                  strokeDasharray="8 5"
                                />
                              );
                            })
                          : heroCutBreakpoints.map((t, sectionIndex) => {
                              const yLine = y + height * t;
                              const widthAtT = ((trapezoidTopWidth ?? boxWidth) + ((trapezoidBottomWidth ?? boxWidth) - (trapezoidTopWidth ?? boxWidth)) * t) * scale;
                              const insetAtT = (width - widthAtT) / 2;
                              return (
                                <line
                                  key={`trap-band-${sectionIndex + 1}`}
                                  x1={x + insetAtT}
                                  y1={yLine}
                                  x2={x + width - insetAtT}
                                  y2={yLine}
                                  stroke="rgba(248,250,252,0.72)"
                                  strokeWidth="1.6"
                                  strokeDasharray="8 5"
                                />
                              );
                            })
                      )}
                      {showCutLines && (
                        isTrapezoidVerticalSplit(cutDirection)
                          ? Array.from({ length: preview.piecesPerUnit }, (_, sectionIndex) => {
                              const t1 = heroSectionBounds[sectionIndex];
                              const t2 = heroSectionBounds[sectionIndex + 1];
                              const topX1 = x + topInset + ((width - topInset * 2) * t1);
                              const topX2 = x + topInset + ((width - topInset * 2) * t2);
                              const bottomX1 = x + bottomInset + ((width - bottomInset * 2) * t1);
                              const bottomX2 = x + bottomInset + ((width - bottomInset * 2) * t2);
                              const topWidthSection = ((trapezoidTopWidth ?? boxWidth) / preview.piecesPerUnit);
                              const bottomWidthSection = ((trapezoidBottomWidth ?? boxWidth) / preview.piecesPerUnit);
                              const labelX = (topX1 + topX2 + bottomX1 + bottomX2) / 4;
                              const labelY = y + height / 2;
                              return (
                                <g key={`trap-label-${sectionIndex + 1}`}>
                                  <text
                                    x={labelX}
                                    y={labelY - 10}
                                    textAnchor="middle"
                                    fill="#f8fafc"
                                    fontSize="12"
                                    fontWeight="700"
                                  >
                                    CUT {sectionIndex + 1}
                                  </text>
                                  <text
                                    x={labelX}
                                    y={labelY + 8}
                                    textAnchor="middle"
                                    fill="#e7e5e4"
                                    fontSize="11"
                                    fontWeight="600"
                                  >
                                    {heroSectionLabels[sectionIndex] ?? `${formatInches((trapezoidTopWidth ?? boxWidth) * (t2 - t1))}" / ${formatInches((trapezoidBottomWidth ?? boxWidth) * (t2 - t1))}"`}
                                  </text>
                                </g>
                              );
                            })
                          : Array.from({ length: preview.piecesPerUnit }, (_, sectionIndex) => {
                              const t1 = heroSectionBounds[sectionIndex];
                              const t2 = heroSectionBounds[sectionIndex + 1];
                              const tMid = (t1 + t2) / 2;
                              const yMid = y + height * tMid;
                              const widthAtMid = ((trapezoidTopWidth ?? boxWidth) + ((trapezoidBottomWidth ?? boxWidth) - (trapezoidTopWidth ?? boxWidth)) * tMid) * scale;
                              const insetAtMid = (width - widthAtMid) / 2;
                              const bandHeight = (item.height ?? 0) * (t2 - t1);
                              return (
                                <g key={`trap-band-label-${sectionIndex + 1}`}>
                                  <text
                                    x={x + width / 2}
                                    y={yMid - 8}
                                    textAnchor="middle"
                                    fill="#f8fafc"
                                    fontSize="12"
                                    fontWeight="700"
                                  >
                                    CUT {sectionIndex + 1}
                                  </text>
                                  <text
                                    x={x + width / 2}
                                    y={yMid + 10}
                                    textAnchor="middle"
                                    fill="#e7e5e4"
                                    fontSize="11"
                                    fontWeight="600"
                                  >
                                    {heroSectionLabels[sectionIndex] ?? `${formatInches(bandHeight)}" band`}
                                  </text>
                                </g>
                              );
                            })
                      )}
                    </>
                  );
                }

                if (item.renderShape === "sector") {
                  const innerRadiusPx = (item.innerRadius ?? 0) * scale;
                  const outerRadiusPx = (item.outerRadius ?? 0) * scale;
                  const arcRad = ((item.arcDegrees ?? 120) * Math.PI) / 180;
                  const cutDirection = item.cutDirection ?? preview.cutDirection ?? "radial_split";
                  const centerX = x + width / 2;
                  const halfArc = arcRad / 2;
                  const centerY = item.flipped
                    ? y - innerRadiusPx * Math.cos(halfArc)
                    : y + outerRadiusPx;
                  const base = item.flipped ? Math.PI / 2 : -Math.PI / 2;
                  const start = base - arcRad / 2;
                  const end = base + arcRad / 2;
                  const x1o = centerX + outerRadiusPx * Math.cos(start);
                  const y1o = centerY + outerRadiusPx * Math.sin(start);
                  const x2o = centerX + outerRadiusPx * Math.cos(end);
                  const y2o = centerY + outerRadiusPx * Math.sin(end);
                  const x1i = centerX + innerRadiusPx * Math.cos(end);
                  const y1i = centerY + innerRadiusPx * Math.sin(end);
                  const x2i = centerX + innerRadiusPx * Math.cos(start);
                  const y2i = centerY + innerRadiusPx * Math.sin(start);
                  const largeArc = (item.arcDegrees ?? 120) > 180 ? 1 : 0;
                  const sectorPath = innerRadiusPx <= 1
                    ? `M${x1o} ${y1o} A${outerRadiusPx} ${outerRadiusPx} 0 ${largeArc} 1 ${x2o} ${y2o} L${centerX} ${centerY} Z`
                    : `M${x1o} ${y1o} A${outerRadiusPx} ${outerRadiusPx} 0 ${largeArc} 1 ${x2o} ${y2o} L${x1i} ${y1i} A${innerRadiusPx} ${innerRadiusPx} 0 ${largeArc} 0 ${x2i} ${y2i} Z`;
                  const blankPath = `M ${x} ${y} H ${x + width} V ${y + height} H ${x} Z`;

                  return (
                    <>
                      {!shapeFirstView && (
                        <path
                          d={`${blankPath} ${sectorPath}`}
                          fill={`url(#${wastePatternId})`}
                          fillRule="evenodd"
                          opacity="0.92"
                        />
                      )}
                      {showLocalBlankGeometry && (
                        <>
                          <rect
                            x={x}
                            y={y}
                            width={width}
                            height={height}
                            fill="none"
                            stroke="rgba(125,211,252,0.82)"
                            strokeWidth="1.5"
                            strokeDasharray="8 6"
                          />
                        </>
                      )}
                      <path
                        d={sectorPath}
                        fill={`url(#${usablePatternId})`}
                        stroke="#f5f5f4"
                        strokeWidth="2"
                      />
                      <line
                        x1={centerX}
                        y1={centerY}
                        x2={x1o}
                        y2={y1o}
                        stroke="rgba(255,255,255,0.18)"
                        strokeWidth="1"
                        strokeDasharray="6 4"
                      />
                      <line
                        x1={centerX}
                        y1={centerY}
                        x2={x2o}
                        y2={y2o}
                        stroke="rgba(255,255,255,0.18)"
                        strokeWidth="1"
                        strokeDasharray="6 4"
                      />
                      {showShapeHeroAnnotations && (
                        <>
                          <circle cx={centerX} cy={centerY} r="2.5" fill="#f8fafc" opacity="0.9" />
                          <text
                            x={x + width / 2}
                            y={Math.max(y - 12, 18)}
                            textAnchor="middle"
                            fill="#cbd5e1"
                            fontSize="12"
                            fontWeight="600"
                          >
                            R{formatInches(item.outerRadius ?? 0)}" outer • R{formatInches(item.innerRadius ?? 0)}" inner
                          </text>
                          <text
                            x={x + width / 2}
                            y={Math.min(y + height + 18, viewHeight - 18)}
                            textAnchor="middle"
                            fill="#e7e5e4"
                            fontSize="12"
                            fontWeight="600"
                          >
                            {Math.round(item.arcDegrees ?? 120)}° sweep
                          </text>
                        </>
                      )}
                      {showCutLines && (
                        isConeRadialSplit(cutDirection)
                          ? heroCutBreakpoints.map((t, segmentIndex) => {
                              const cutAngle = start + (arcRad * t);
                              return (
                                <line
                                  key={`sector-cut-${segmentIndex + 1}`}
                                  x1={centerX + innerRadiusPx * Math.cos(cutAngle)}
                                  y1={centerY + innerRadiusPx * Math.sin(cutAngle)}
                                  x2={centerX + (outerRadiusPx - 4) * Math.cos(cutAngle)}
                                  y2={centerY + (outerRadiusPx - 4) * Math.sin(cutAngle)}
                                  stroke="rgba(248,250,252,0.72)"
                                  strokeWidth="1.6"
                                  strokeDasharray="8 5"
                                />
                              );
                            })
                          : heroCutBreakpoints.map((t, segmentIndex) => {
                              const bandRadius = innerRadiusPx + ((outerRadiusPx - innerRadiusPx) * t);
                              const xStart = centerX + bandRadius * Math.cos(start);
                              const yStart = centerY + bandRadius * Math.sin(start);
                              const xEnd = centerX + bandRadius * Math.cos(end);
                              const yEnd = centerY + bandRadius * Math.sin(end);
                              const large = (item.arcDegrees ?? 120) > 180 ? 1 : 0;
                              return (
                                <path
                                  key={`sector-band-${segmentIndex + 1}`}
                                  d={`M${xStart} ${yStart} A${bandRadius} ${bandRadius} 0 ${large} 1 ${xEnd} ${yEnd}`}
                                  fill="none"
                                  stroke="rgba(248,250,252,0.72)"
                                  strokeWidth="1.6"
                                  strokeDasharray="8 5"
                                />
                              );
                            })
                      )}
                      {showCutLines && (
                        isConeRadialSplit(cutDirection)
                          ? Array.from({ length: preview.piecesPerUnit }, (_, segmentIndex) => {
                              const t1 = heroSectionBounds[segmentIndex];
                              const t2 = heroSectionBounds[segmentIndex + 1];
                              const midAngle = start + (arcRad * ((t1 + t2) / 2));
                              const labelRadius = innerRadiusPx + ((outerRadiusPx - innerRadiusPx) * 0.56);
                              return (
                                <g key={`sector-label-${segmentIndex + 1}`}>
                                  <text
                                    x={centerX + Math.cos(midAngle) * labelRadius}
                                    y={centerY + Math.sin(midAngle) * labelRadius - 8}
                                    textAnchor="middle"
                                    fill="#f8fafc"
                                    fontSize="12"
                                    fontWeight="700"
                                  >
                                    CUT {segmentIndex + 1}
                                  </text>
                                  <text
                                    x={centerX + Math.cos(midAngle) * labelRadius}
                                    y={centerY + Math.sin(midAngle) * labelRadius + 10}
                                    textAnchor="middle"
                                    fill="#e7e5e4"
                                    fontSize="11"
                                    fontWeight="600"
                                  >
                                    {heroSectionLabels[segmentIndex] ?? `${Math.round((item.arcDegrees ?? 120) * (t2 - t1))}° sector`}
                                  </text>
                                </g>
                              );
                            })
                          : Array.from({ length: preview.piecesPerUnit }, (_, segmentIndex) => {
                              const t1 = heroSectionBounds[segmentIndex];
                              const t2 = heroSectionBounds[segmentIndex + 1];
                              const bandInner = (item.innerRadius ?? 0) + (((item.outerRadius ?? 0) - (item.innerRadius ?? 0)) * t1);
                              const bandOuter = (item.innerRadius ?? 0) + (((item.outerRadius ?? 0) - (item.innerRadius ?? 0)) * t2);
                              const bandRadius = innerRadiusPx + ((outerRadiusPx - innerRadiusPx) * ((t1 + t2) / 2));
                              const labelAngle = start + (arcRad / 2);
                              return (
                                <g key={`sector-band-label-${segmentIndex + 1}`}>
                                  <text
                                    x={centerX + Math.cos(labelAngle) * bandRadius}
                                    y={centerY + Math.sin(labelAngle) * bandRadius - 8}
                                    textAnchor="middle"
                                    fill="#f8fafc"
                                    fontSize="12"
                                    fontWeight="700"
                                  >
                                    CUT {segmentIndex + 1}
                                  </text>
                                  <text
                                    x={centerX + Math.cos(labelAngle) * bandRadius}
                                    y={centerY + Math.sin(labelAngle) * bandRadius + 10}
                                    textAnchor="middle"
                                    fill="#e7e5e4"
                                    fontSize="11"
                                    fontWeight="600"
                                  >
                                    {heroSectionLabels[segmentIndex] ?? `R${formatInches(bandInner)}"-R${formatInches(bandOuter)}"`}
                                  </text>
                                </g>
                              );
                            })
                      )}
                    </>
                  );
                }

                return (
                  <rect
                    x={x + 1.5}
                    y={y + 1.5}
                    width={Math.max(width - 3, 0)}
                    height={Math.max(height - 3, 0)}
                    rx="6"
                    fill={`url(#${usablePatternId})`}
                    stroke="#84cc16"
                    strokeWidth="2"
                  />
                );
              };

              return (
                <g key={index + 1}>
                  {renderShape()}
                  {showBadge && (
                    <>
                      <rect
                        x={badgeX}
                        y={badgeY}
                        width="56"
                        height="28"
                        rx="14"
                        fill="#111827"
                        opacity="0.96"
                      />
                      <text
                        x={badgeCenterX}
                        y={badgeCenterY + 4}
                        textAnchor="middle"
                        fill="#f8fafc"
                        fontSize="11"
                        fontWeight="700"
                      >
                        CUT {showShapeHeroAnnotations ? 1 : index + 1}
                      </text>
                    </>
                  )}
                  {showDims && !showCutLines && (
                    splitLabel ? (
                      <>
                        <text
                          x={x + width / 2}
                          y={dimY - 8}
                          textAnchor="middle"
                          fill="#e7e5e4"
                          fontSize="16"
                          fontWeight="600"
                        >
                          {splitLabel[0]}
                        </text>
                        {splitLabel[1] && (
                          <text
                            x={x + width / 2}
                            y={dimY + 12}
                            textAnchor="middle"
                            fill="#cbd5e1"
                            fontSize="13"
                            fontWeight="600"
                          >
                            {splitLabel[1]}
                          </text>
                        )}
                      </>
                    ) : (
                      <text
                        x={x + width / 2}
                        y={dimY}
                        textAnchor="middle"
                        fill="#e7e5e4"
                        fontSize="16"
                        fontWeight="600"
                      >
                        {item.label}
                      </text>
                    )
                  )}
                </g>
              );
            })}

            {offcutLabelBands.map((band, index) => {
              const centerX = surfaceX + (band.x + band.width / 2) * scale;
              const centerY = surfaceY + (band.y + band.height / 2) * scale;
              const dims = `${formatInches(band.width)}" × ${formatInches(band.height)}"`;
              const tallEnoughForTitle = band.height * scale >= 30;

              return (
                <text
                  key={`offcut-label-${index + 1}`}
                  x={centerX}
                  y={centerY}
                  textAnchor="middle"
                  fill="#d6d3d1"
                  fontWeight="500"
                >
                  {tallEnoughForTitle && (
                    <tspan x={centerX} dy="-2" fontSize="13">
                      Reusable offcut
                    </tspan>
                  )}
                  <tspan
                    x={centerX}
                    dy={tallEnoughForTitle ? "16" : "0"}
                    fontSize={tallEnoughForTitle ? "11" : "12"}
                    fill="#fbbf24"
                  >
                    {dims}
                  </tspan>
                </text>
              );
            })}

            <line
              x1={shapeFirstView ? localBlankX : surfaceX}
              y1={rowLabelY}
              x2={shapeFirstView ? localBlankX + localBlankW : surfaceX + surfacePxW}
              y2={rowLabelY}
              stroke="#d6d3d1"
              strokeWidth="1.5"
              markerStart={`url(#${markerId})`}
              markerEnd={`url(#${markerId})`}
            />
            <text
              x={shapeFirstView ? localBlankX + localBlankW / 2 : surfaceX + surfacePxW / 2}
              y={rowLabelY + 24}
              textAnchor="middle"
              fill="#e7e5e4"
              fontSize="14"
              fontWeight="600"
            >
              {shapeFirstView
                ? `${formatInches(previewBounds.occupiedWidth)}" rough blank width`
                : `${formatInches(previewRollW)}" stock width`}
            </text>

            <line
              x1={colLabelX}
              y1={shapeFirstView ? localBlankY : surfaceY}
              x2={colLabelX}
              y2={shapeFirstView ? localBlankY + localBlankH : surfaceY + surfacePxH}
              stroke="#d6d3d1"
              strokeWidth="1.5"
              markerStart={`url(#${markerId})`}
              markerEnd={`url(#${markerId})`}
            />
            <text
              x={colLabelX + 26}
              y={shapeFirstView ? localBlankY + localBlankH / 2 : surfaceY + surfacePxH / 2}
              textAnchor="middle"
              fill="#e7e5e4"
              fontSize="14"
              fontWeight="600"
              transform={`rotate(90 ${colLabelX + 26} ${shapeFirstView ? localBlankY + localBlankH / 2 : surfaceY + surfacePxH / 2})`}
            >
              {shapeFirstView
                ? `${formatInches(previewBounds.occupiedHeight)}" rough blank height`
                : `${formatInches(previewRollL)}" height`}
            </text>
          </svg>
        </div>

        <div className="grid gap-3 border-t border-border bg-background px-4 py-4 md:grid-cols-6">
            <div className="rounded-lg border bg-muted/20 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Parts Completed
            </div>
            <div className="mt-1 text-2xl font-semibold text-foreground">{displayPreview.unitsCompleted}</div>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Material Used
            </div>
            <div className="mt-1 text-2xl font-semibold text-foreground">{usedSqFt.toFixed(2)} sq ft</div>
          </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {reusableMetricLabel}
              </div>
            <div className="mt-1 text-2xl font-semibold text-amber-600">{reusableOffcutSqFt.toFixed(2)} sq ft</div>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Scrap / Waste
            </div>
            <div className="mt-1 text-2xl font-semibold text-red-600">{scrapSqFt.toFixed(2)} sq ft</div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {pieceCountLabel}
              </div>
              <div className="mt-1 text-2xl font-semibold text-foreground">{pieceCountValue}</div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Fab Score
              </div>
              <div className={`mt-1 text-2xl font-semibold ${
                fabScore.score >= 80 ? "text-green-600" :
                fabScore.score >= 60 ? "text-amber-600" : "text-red-600"
              }`}>
                {fabScore.score}/100
              </div>
            </div>
          </div>

          <div className="border-t border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
            {metricsAreEstimatedFromStock
              ? `Optimized from placed stock area: ${stockSqFt.toFixed(2)} sq ft`
              : `Preview stock area: ${stockSqFt.toFixed(2)} sq ft`}
          {displayPreview.overflowUnits > 0 && (
            <span className="ml-2 font-medium text-amber-600">
              {isSplitStockPreview
                ? `Another sheet is required to place the remaining ${missingCutPieceCount} cut piece${missingCutPieceCount === 1 ? "" : "s"}.`
                : `Another sheet is required to place the remaining ${displayPreview.overflowUnits} part${displayPreview.overflowUnits === 1 ? "" : "s"}.`}
            </span>
          )}
        </div>

        {showCutPlan && (
          <div className="border-t border-border bg-background px-4 py-4">
            <div className="mb-3">
              <div className="text-sm font-semibold text-foreground">{displayPreview.cutPlanTitle}</div>
              <div className="text-xs text-muted-foreground">
                These are the practical cut steps for one finished {displayPreview.renderShape === "sector" ? "cone spread" : displayPreview.renderShape}.
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {displayPreview.cutSteps.map((step, index) => (
                <div key={`${step.title}-${index + 1}`} className="rounded-lg border bg-muted/20 p-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/15 text-[11px] font-semibold text-sky-700">
                      {index + 1}
                    </span>
                    <div className="text-sm font-semibold text-foreground">{step.title}</div>
                  </div>
                  <div className="mt-2 text-xs leading-5 text-muted-foreground">{step.detail}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Styling helpers — uses CSS variables to match the page theme 
  const inp = "w-full bg-[var(--color-background-secondary)] border border-[var(--color-border-secondary)] text-[var(--color-text-primary)] rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-border-primary)] transition-colors";
  const lbl = "block text-[9px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-1";
  const maxScore = Math.max(...scored.map(s => s.score), 1);

  const scoreBarColor = (s: ScoredStrategy) =>
    s.id === scored[0]?.id ? "var(--color-border-success)" : s.score > 55 ? "var(--color-border-info)" : "var(--color-border-tertiary)";

  const badgeStyle = (s: ScoredStrategy, rank: number): React.CSSProperties => {
    if (rank === 0) return { background: "var(--color-background-success)", color: "var(--color-text-success)", border: "1px solid var(--color-border-success)" };
    if (s.score > 75) return { background: "var(--color-background-info)", color: "var(--color-text-info)", border: "1px solid var(--color-border-info)" };
    if (s.score > 45) return { background: "var(--color-background-secondary)", color: "var(--color-text-secondary)", border: "0.5px solid var(--color-border-tertiary)" };
    return { background: "var(--color-background-danger)", color: "var(--color-text-danger)", border: "1px solid var(--color-border-danger)" };
  };
  const badgeText = (rank: number, score: number) =>
    rank === 0 ? "Best" : score > 75 ? "Good" : score > 45 ? "OK" : "Poor";

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">

      {/* ── header ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/40">
        <div className="flex items-center gap-2">
          <Scissors className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground tracking-wide">
            Nesting Layout &amp; Cut Strategy
          </span>
        </div>
        <div className="flex gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-500/30 border border-green-500" />usable</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-400/20 border border-blue-400" />tri-B</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-400/20 border border-dashed border-red-400" />scrap</span>
        </div>
      </div>

      {/* ── controls ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 gap-3 px-4 py-3 border-b border-border bg-background">
        <div className="col-span-2 sm:col-span-1">
          <label className={lbl}>Shape</label>
          <select value={shape} onChange={e => { setShape(e.target.value as ShapeType); setActiveStep(0); }} className={inp + " cursor-pointer"}>
            <option value="rect">Rectangle / Square</option>
            <option value="circle">Circle / Round</option>
            <option value="cone">Cone / Arc</option>
          </select>
        </div>
        <div><label className={lbl}>Roll Width (in)</label><input type="number" min="1" value={rollW} onChange={e => setRollW(+e.target.value)} className={inp} /></div>
        <div><label className={lbl}>Roll Length (in)</label><input type="number" min="1" value={rollL} onChange={e => setRollL(+e.target.value)} className={inp} /></div>

        {shape === "rect" && <>
          <div><label className={lbl}>Cut Width (in)</label><input type="number" min="0.5" step="0.5" value={cutW} onChange={e => setCutW(+e.target.value)} className={inp} /></div>
          <div><label className={lbl}>Cut Height (in)</label><input type="number" min="0.5" step="0.5" value={cutH} onChange={e => setCutH(+e.target.value)} className={inp} /></div>
          <div><label className={lbl}>Qty Needed</label><input type="number" min="1" value={qty} onChange={e => setQty(+e.target.value)} className={inp} /></div>
          <div><label className={lbl}>Diag Angle (°)</label><input type="number" min="10" max="80" step="1" value={diagAng} onChange={e => setDiagAng(+e.target.value)} className={inp} /></div>
          <div className="col-span-2 sm:col-span-1">
            <label className={lbl}>Grain Direction</label>
            <select value={grain} onChange={e => setGrain(e.target.value as GrainDir)} className={inp + " cursor-pointer"}>
              <option value="none">No grain</option>
              <option value="width">Along width</option>
              <option value="length">Along length</option>
            </select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={lbl}>Diag Direction</label>
            <select value={ddir} onChange={e => setDdir(e.target.value as DiagDir)} className={inp + " cursor-pointer"}>
              <option value="ltr">Left-to-right ╱</option>
              <option value="rtl">Right-to-left ╲</option>
            </select>
          </div>
        </>}
        {shape === "circle" && <div className="col-span-2"><label className={lbl}>Diameter (in)</label><input type="number" min="1" step="0.5" value={diam} onChange={e => setDiam(+e.target.value)} className={inp} /></div>}
        {shape === "cone" && <>
          <div><label className={lbl}>Inner R (in)</label><input type="number" min="1" step="0.5" value={innerR} onChange={e => setInnerR(+e.target.value)} className={inp} /></div>
          <div><label className={lbl}>Outer R (in)</label><input type="number" min="2" step="0.5" value={outerR} onChange={e => setOuterR(+e.target.value)} className={inp} /></div>
          <div><label className={lbl}>Arc Sweep (°)</label><input type="number" min="10" max="359" step="5" value={arcDeg} onChange={e => setArcDeg(+e.target.value)} className={inp} /></div>
        </>}
      </div>

      {/* ── RECT MODE: 6-strategy grid ── */}
      {shape === "rect" && <>
        <div className="px-4 pt-3 pb-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            All cut strategies — click to see step-by-step
          </p>
        </div>

        {/* strategy cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 px-4 pb-3">
          {scored.map((s, rank) => (
            <div
              key={s.id}
              onClick={() => { setActiveId(s.id); setActiveStep(0); }}
              className="rounded-lg overflow-hidden cursor-pointer transition-transform hover:-translate-y-px bg-card"
              style={{
                border: s.id === activeId
                  ? "2px solid var(--color-border-info)"
                  : rank === 0
                  ? "2px solid var(--color-border-success)"
                  : "0.5px solid var(--color-border-tertiary)",
              }}
            >
              {/* card head */}
              <div className="flex items-start justify-between gap-1 px-2.5 pt-2 pb-1">
                <div>
                  <div className="text-[13.8px] font-semibold text-foreground">{s.name}</div>
                  <div className="text-[13.375px] text-muted-foreground mt-0.5">{s.sub}</div>
                </div>
                <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 mt-0.5" style={badgeStyle(s, rank)}>
                  {badgeText(rank, s.score)}
                </span>
              </div>

              {/* mini SVG */}
              <svg
                ref={el => { if (el) miniRefs.current[s.id] = el; }}
                width="100%"
                style={{ display: "block" }}
              />

              {/* stats row */}
              <div className="grid grid-cols-3 border-t border-border">
                {[
                  { l: "Pieces", v: String(s.pieces), good: s.pieces >= qty },
                  { l: "Waste",  v: `${s.waste.toFixed(1)}%`, good: s.waste < 15 },
                  { l: "Score",  v: String(Math.round(s.score)), good: rank === 0 },
                ].map(stat => (
                  <div key={stat.l} className="text-center py-1.5 border-r border-border last:border-r-0">
                    <div className="text-[8px] text-muted-foreground uppercase tracking-wide">{stat.l}</div>
                    <div
                      className="text-[11px] font-semibold"

                      style={{
                        color: stat.good
                          ? "var(--color-text-success)"
                          : stat.v.endsWith("%") && parseFloat(stat.v) > 25
                          ? "var(--color-text-danger)"
                          : "var(--color-text-secondary)",
                      }}
                    >
                      {stat.v}
                    </div>
                  </div>
                ))}
              </div>

              {/* score bar */}
              <div className="mx-2 mb-2 mt-1 h-[3px] rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(s.score / maxScore * 100).toFixed(0)}%`, background: scoreBarColor(s) }} />
              </div>
            </div>
          ))}
        </div>

        {/* ── detail panel ── */}
        {activeStrat && (
          <div className="mx-4 mb-4 rounded-lg border border-border overflow-hidden bg-muted/30">
            {/* detail header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-background">
              <span className="text-[11px] font-semibold text-foreground">
                {activeStrat.name} — step-by-step
              </span>
              <div className="flex gap-3 text-[10px] text-muted-foreground">
                <span>{activeStrat.pieces} pcs</span>
                <span>{activeStrat.waste.toFixed(1)}% waste</span>
                <span>score {Math.round(activeStrat.score)}</span>
              </div>
            </div>

            {/* step tabs */}
            <div className="flex gap-2 flex-wrap px-3 pt-2">
              {activeStrat.steps.map((step, i) => (
                <button
                  key={step}
                  onClick={() => setActiveStep(i)}
                  className="text-[10px] px-2.5 py-1 rounded-full border transition-all"
                  style={{
                    background:  i === activeStep ? "var(--color-background-info)" : "transparent",
                    color:       i === activeStep ? "var(--color-text-info)" : "var(--color-text-secondary)",
                    borderColor: i === activeStep ? "var(--color-border-info)" : "var(--color-border-tertiary)",
                  }}
                >
                  {step}
                </button>
              ))}
            </div>

            {/* detail SVG — keeps dark background so cut lines are visible */}
            <div className="px-3 pt-2">
              <style>{`@keyframes dashIn{from{stroke-dashoffset:900}to{stroke-dashoffset:0}}`}</style>
              <svg ref={detailRef} width="100%" style={{ display: "block", borderRadius: "6px", background: "var(--svg-bg)" }} />
            </div>

            {/* step note */}
            <div className="mx-3 my-2 px-3 py-2 rounded-md bg-muted text-[11px] text-muted-foreground" style={{ lineHeight: 1.55 }}>
              {stepNote}
            </div>

            {/* reasons */}
            <div className="flex flex-col gap-1 px-3 pb-3 border-t border-border pt-2">
              {activeStrat.reasons.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-[10px] text-muted-foreground" style={{ lineHeight: 1.45 }}>
                  <div
                    className="w-3.5 h-3.5 rounded-full flex-shrink-0 flex items-center justify-center text-[7px] font-bold mt-px"
                    style={{
                      background: r.p === "p" ? "var(--color-background-success)" : r.p === "w" ? "var(--color-background-warning)" : "var(--color-background-danger)",
                      color:      r.p === "p" ? "var(--color-text-success)"      : r.p === "w" ? "var(--color-text-warning)"       : "var(--color-text-danger)",
                    }}
                  >
                    {r.p === "p" ? "✓" : r.p === "w" ? "!" : "✕"}
                  </div>
                  <span>{r.t}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </>}

      {/* CIRCLE / CONE MODE */}
      {shape !== "rect" && (
        <>
          <div className="px-3 pt-2 pb-1">
            <svg ref={bgSvgRef} width="100%" viewBox="0 0 680 310" style={{ display: "block", borderRadius: "6px", background: "#0f172a" }} />
          </div>
          <div className="grid grid-cols-3 gap-2 px-4 py-3">
            {[
              { label: "Pieces",        val: String(bgStats.count),          good: true  },
              { label: "Material Used", val: `${bgStats.used.toFixed(1)}%`,  good: true  },
              { label: "Scrap / Waste", val: `${bgStats.waste.toFixed(1)}%`, good: false },
            ].map(s => (
              <div key={s.label} className="rounded-lg bg-muted/40 border border-border text-center px-3 py-2.5">
                <div className="text-[9px] uppercase tracking-widest font-semibold text-muted-foreground mb-1">{s.label}</div>
                <div
                  className="text-xl font-bold"
                  style={{ color: s.good ? "var(--color-text-success)" : "var(--color-text-danger)" }}
                >
                  {s.val}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
