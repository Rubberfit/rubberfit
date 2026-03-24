"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Scissors } from "lucide-react";

// Types 
type ShapeType   = "rect" | "circle" | "cone";
type GrainDir    = "none" | "width" | "length";
type DiagDir     = "ltr" | "rtl";
type StratMethod = "rect" | "diag";

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

// Main Component 
export default function NestingVisualizer({
  defaultRollWidth  = 48,
  defaultRollLength = 96,
  defaultCutWidth   = 24,
  defaultCutHeight  = 12,
}: NestingVisualizerProps) {

  // shared
  const [shape,   setShape]   = useState<ShapeType>("rect");
  const [rollW,   setRollW]   = useState(defaultRollWidth);
  const [rollL,   setRollL]   = useState(defaultRollLength);
  // rect mode
  const [cutW,    setCutW]    = useState(defaultCutWidth);
  const [cutH,    setCutH]    = useState(defaultCutHeight);
  const [qty,     setQty]     = useState(6);
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

  const bgSvgRef   = useRef<SVGSVGElement>(null);
  const detailRef  = useRef<SVGSVGElement>(null);
  const miniRefs   = useRef<Record<string, SVGSVGElement>>({});

  // Rect strategy scoring 
  useEffect(() => {
    if (shape !== "rect") return;
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
    if (shape !== "rect") return;
    scored.forEach(s => {
      const svg = miniRefs.current[s.id];
      if (svg) drawMiniRoll(svg, s, rollW, rollL, grain);
    });
  }, [scored, shape, grain, rollW, rollL]);

  // Draw detail step 
  useEffect(() => {
    if (shape !== "rect") return;
    const active = scored.find(s => s.id === activeId);
    if (!active || !detailRef.current) return;
    drawDetailStep(detailRef.current, active, rollW, rollL, activeStep);
  }, [scored, activeId, activeStep, shape, rollW, rollL]);

  // ── Non-rect render 
  const renderBg = useCallback(() => {
    const svg = bgSvgRef.current;
    if (!svg || shape === "rect") return;
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
  }, [shape, rollW, rollL, diam, innerR, outerR, arcDeg]);

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