"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Scissors, LayoutGrid, CheckSquare, Square, ChevronDown, ChevronUp } from "lucide-react";
import NestingVisualizer from "./NestingVisualizer";

// ─── Preset catalogue ─────────────────────────────────────────────────────────
export interface PresetDimension {
  id:       string;
  label:    string;
  width:    number;
  length:   number;
  quantity: number;
  category: "standard" | "large" | "narrow";
}

export const PRESET_DIMENSIONS: PresetDimension[] = [
  { id: "p1",  label: "18 × 14",   width: 18,   length: 14,   quantity: 2, category: "standard" },
  { id: "p2",  label: "24 × 50",   width: 24,   length: 50,   quantity: 2, category: "large"    },
  { id: "p3",  label: "24 × 14",   width: 24,   length: 14,   quantity: 2, category: "standard" },
  { id: "p4",  label: "24 × 40",   width: 24,   length: 40,   quantity: 2, category: "large"    },
  { id: "p5",  label: "12 × 24",   width: 12,   length: 24,   quantity: 2, category: "standard" },
  { id: "p6",  label: "11½ × 40",  width: 11.5, length: 40,   quantity: 2, category: "narrow"   },
  { id: "p7",  label: "11½ × 12",  width: 11.5, length: 12,   quantity: 2, category: "narrow"   },
  { id: "p8",  label: "56 × 12",   width: 56,   length: 12,   quantity: 2, category: "large"    },
  { id: "p9",  label: "12 × 11½",  width: 12,   length: 11.5, quantity: 2, category: "narrow"   },
  { id: "p10", label: "72 × 12",   width: 72,   length: 12,   quantity: 2, category: "large"    },
  { id: "p11", label: "38 × 24",   width: 38,   length: 24,   quantity: 2, category: "large"    },
  { id: "p12", label: "11½ × 38",  width: 11.5, length: 38,   quantity: 2, category: "narrow"   },
  { id: "p13", label: "48 × 24",   width: 48,   length: 24,   quantity: 2, category: "large"    },
  { id: "p14", label: "40 × 12",   width: 40,   length: 12,   quantity: 2, category: "large"    },
  { id: "p15", label: "48 × 11½",  width: 48,   length: 11.5, quantity: 2, category: "narrow"   },
  { id: "p16", label: "38 × 12",   width: 38,   length: 12,   quantity: 2, category: "large"    },
];

// ─── Category styling ─────────────────────────────────────────────────────────
const CAT_CARD: Record<PresetDimension["category"], string> = {
  standard: "bg-blue-50   border-blue-200  text-blue-800",
  large:    "bg-purple-50 border-purple-200 text-purple-800",
  narrow:   "bg-amber-50  border-amber-200  text-amber-800",
};
const CAT_BADGE: Record<PresetDimension["category"], string> = {
  standard: "bg-blue-100   text-blue-700",
  large:    "bg-purple-100 text-purple-700",
  narrow:   "bg-amber-100  text-amber-700",
};
const CAT_DOT: Record<PresetDimension["category"], string> = {
  standard: "bg-blue-400",
  large:    "bg-purple-400",
  narrow:   "bg-amber-400",
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface PresetDimensionSelectorProps {
  /** Fires when user clicks "Use These Dimensions" — populates the cut form */
  onApply?: (dims: { width: number; length: number; quantity: number }) => void;
  /** Roll dimensions used to power the NestingVisualizer preview */
  rollWidth?:  number;
  rollLength?: number;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PresetDimensionSelector({
  onApply,
  rollWidth  = 72,
  rollLength = 144,
}: PresetDimensionSelectorProps) {

  const [checked,       setChecked]       = useState<Set<string>>(new Set());
  const [filter,        setFilter]        = useState<"all" | PresetDimension["category"]>("all");
  // Which single preset is being previewed in the NestingVisualizer
  const [previewId,     setPreviewId]     = useState<string | null>(null);
  // Whether the full strategy panel is expanded
  const [stratOpen,     setStratOpen]     = useState(false);

  // ── selection helpers ────────────────────────────────────────────────────
  const toggle = (id: string) =>
    setChecked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const selectAll = () => setChecked(new Set(PRESET_DIMENSIONS.map(p => p.id)));
  const clearAll  = () => { setChecked(new Set()); setPreviewId(null); setStratOpen(false); };

  const selectedPresets = PRESET_DIMENSIONS.filter(p => checked.has(p.id));
  const previewPreset   = PRESET_DIMENSIONS.find(p => p.id === previewId) ?? null;

  const totalArea = selectedPresets.reduce(
    (acc, p) => acc + (p.width * p.length * p.quantity) / 144, 0
  );

  const visible = filter === "all"
    ? PRESET_DIMENSIONS
    : PRESET_DIMENSIONS.filter(p => p.category === filter);

  // ── apply first selected to form ─────────────────────────────────────────
  const handleApply = () => {
    if (!onApply || selectedPresets.length === 0) return;
    const first = selectedPresets[0];
    onApply({ width: first.width, length: first.length, quantity: first.quantity });
  };

  // ── preview a preset in the NestingVisualizer ─────────────────────────────
  const handlePreview = (preset: PresetDimension, e: React.MouseEvent) => {
    e.stopPropagation();          // don't also toggle the checkbox
    if (previewId === preset.id && stratOpen) {
      // clicking same preset again closes the panel
      setStratOpen(false);
      setPreviewId(null);
    } else {
      setPreviewId(preset.id);
      setStratOpen(true);
    }
  };

  // ─── JSX ──────────────────────────────────────────────────────────────────
  return (
    <Card className="w-full border border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <LayoutGrid className="h-4 w-4 text-slate-500" />
            Standard Cut Presets
          </CardTitle>

          {/* Category filter pills */}
          <div className="flex gap-1.5 flex-wrap">
            {(["all", "standard", "large", "narrow"] as const).map(cat => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                  filter === cat
                    ? "bg-slate-800 text-white border-slate-800"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
                }`}
              >
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Select / Clear all row */}
        <div className="flex items-center gap-3 pt-1">
          <button onClick={selectAll} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
            <CheckSquare className="h-3 w-3" /> Select all
          </button>
          <span className="text-slate-300">|</span>
          <button onClick={clearAll} className="flex items-center gap-1 text-xs text-slate-500 hover:underline">
            <Square className="h-3 w-3" /> Clear
          </button>
          {previewPreset && (
            <>
              <span className="text-slate-300">|</span>
              <span className="text-xs text-slate-500">
                Previewing <span className="font-mono font-semibold text-slate-700">{previewPreset.label}"</span>
              </span>
            </>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">

        {/* ── Preset grid ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {visible.map(preset => {
            const isChecked   = checked.has(preset.id);
            const isPreviewed = previewId === preset.id && stratOpen;

            return (
              <div key={preset.id} className="relative">
                {/* Checkbox label */}
                <label
                  className={`
                    flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer
                    transition-all duration-150 select-none
                    ${isChecked
                      ? `${CAT_CARD[preset.category]} shadow-sm ring-1 ring-inset ring-current/20`
                      : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    }
                    ${isPreviewed ? "ring-2 ring-blue-400" : ""}
                  `}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggle(preset.id)}
                    className="sr-only"
                  />

                  {/* Custom checkbox */}
                  <span className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                    isChecked ? "bg-current border-current" : "border-slate-300 bg-white"
                  }`}>
                    {isChecked && (
                      <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white fill-white">
                        <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" />
                      </svg>
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-sm font-semibold leading-tight">
                        {preset.label}"
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${CAT_BADGE[preset.category]}`}>
                        {preset.category}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      qty: {preset.quantity} · {((preset.width * preset.length * preset.quantity) / 144).toFixed(1)} sq ft
                    </div>
                  </div>
                </label>

                {/* "View strategies" button — sits below the label */}
                <button
                  onClick={e => handlePreview(preset, e)}
                  className={`
                    mt-1 w-full flex items-center justify-center gap-1 py-1 rounded-md
                    text-[10px] font-medium border transition-all
                    ${isPreviewed
                      ? "bg-blue-50 border-blue-300 text-blue-700"
                      : "bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700"
                    }
                  `}
                >
                  {isPreviewed ? (
                    <><ChevronUp className="h-3 w-3" /> Hide strategies</>
                  ) : (
                    <><LayoutGrid className="h-3 w-3" /> View strategies</>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* ── NestingVisualizer — expands when a preset is previewed ── */}
        {previewPreset && stratOpen && (
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${CAT_DOT[previewPreset.category]}`} />
                <span className="text-sm font-semibold text-slate-800">
                  Cut strategies for {previewPreset.label}"
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${CAT_BADGE[previewPreset.category]}`}>
                  {previewPreset.category}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {onApply && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => onApply({
                      width:    previewPreset.width,
                      length:   previewPreset.length,
                      quantity: previewPreset.quantity,
                    })}
                  >
                    <Scissors className="h-3.5 w-3.5 mr-1.5" />
                    Use {previewPreset.label}"
                  </Button>
                )}
                <button
                  onClick={() => { setStratOpen(false); setPreviewId(null); }}
                  className="text-slate-400 hover:text-slate-600 text-xs px-2 py-1 rounded hover:bg-slate-100 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>

            {/*
              NestingVisualizer wired to this preset's dimensions + the roll from inventory.
              Workers see all 6 cut strategies (horizontal, vertical, rotated, corner-diagonal,
              custom-diagonal, rotated+diagonal) scored and ranked, with step-by-step cut lines.
            */}
            <NestingVisualizer
              defaultRollWidth={rollWidth}
              defaultRollLength={rollLength}
              defaultCutWidth={previewPreset.width}
              defaultCutHeight={previewPreset.length}
            />
          </div>
        )}

        {/* ── Selection summary (when presets are checked) ── */}
        {selectedPresets.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Scissors className="h-4 w-4 text-slate-500" />
                <span className="text-sm font-medium text-slate-700">
                  {selectedPresets.length} preset{selectedPresets.length > 1 ? "s" : ""} selected
                </span>
                <Badge variant="outline" className="text-xs">
                  {totalArea.toFixed(2)} sq ft total
                </Badge>
              </div>
              {onApply && (
                <Button size="sm" onClick={handleApply} className="shrink-0">
                  Use First Selected
                </Button>
              )}
            </div>

            {/* Selected tags — click to deselect */}
            <div className="flex gap-1.5 flex-wrap">
              {selectedPresets.map(p => (
                <span
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  className={`
                    flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono
                    font-medium cursor-pointer border transition-colors hover:opacity-75
                    ${CAT_CARD[p.category]}
                  `}
                >
                  {p.label}"
                  <span className="ml-0.5 opacity-50">×</span>
                </span>
              ))}
            </div>

            {/* Quick dimension summary table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-1 pr-3 font-semibold text-slate-600">Dimensions</th>
                    <th className="text-right py-1 pr-3 font-semibold text-slate-600">Qty</th>
                    <th className="text-right py-1 pr-3 font-semibold text-slate-600">Sq ft each</th>
                    <th className="text-right py-1 font-semibold text-slate-600">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPresets.map(p => (
                    <tr key={p.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-1 pr-3 font-mono font-semibold text-slate-800">{p.label}"</td>
                      <td className="py-1 pr-3 text-right text-slate-600">{p.quantity}</td>
                      <td className="py-1 pr-3 text-right text-slate-600">
                        {((p.width * p.length) / 144).toFixed(2)}
                      </td>
                      <td className="py-1 text-right">
                        <button
                          onClick={() => {
                            setPreviewId(p.id);
                            setStratOpen(true);
                            // scroll the strategy panel into view
                            setTimeout(() => {
                              document.getElementById(`strat-panel-${p.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }, 50);
                          }}
                          className="text-blue-600 hover:underline text-[10px] font-medium"
                        >
                          View strategies
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-100">
                    <td colSpan={2} className="py-1 pr-3 font-semibold text-slate-700">Total</td>
                    <td className="py-1 text-right font-semibold text-slate-700" colSpan={2}>
                      {totalArea.toFixed(2)} sq ft
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

      </CardContent>
    </Card>
  );
}