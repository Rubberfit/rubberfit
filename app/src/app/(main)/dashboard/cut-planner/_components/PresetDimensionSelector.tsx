"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Scissors, LayoutGrid, CheckSquare, Square } from "lucide-react";

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
  { id: "p1",  label: "18 × 14",   width: 18,   length: 14,   quantity: 1, category: "standard" },
  { id: "p2",  label: "24 × 50",   width: 24,   length: 50,   quantity: 1, category: "large"    },
  { id: "p3",  label: "24 × 14",   width: 24,   length: 14,   quantity: 1, category: "standard" },
  { id: "p4",  label: "24 × 40",   width: 24,   length: 40,   quantity: 1, category: "large"    },
  { id: "p5",  label: "12 × 24",   width: 12,   length: 24,   quantity: 1, category: "standard" },
  { id: "p6",  label: "11½ × 40",  width: 11.5, length: 40,   quantity: 1, category: "narrow"   },
  { id: "p7",  label: "11½ × 12",  width: 11.5, length: 12,   quantity: 1, category: "narrow"   },
  { id: "p8",  label: "56 × 12",   width: 56,   length: 12,   quantity: 1, category: "large"    },
  { id: "p9",  label: "12 × 11½",  width: 12,   length: 11.5, quantity: 1, category: "narrow"   },
  { id: "p10", label: "72 × 12",   width: 72,   length: 12,   quantity: 1, category: "large"    },
  { id: "p11", label: "38 × 24",   width: 38,   length: 24,   quantity: 1, category: "large"    },
  { id: "p12", label: "11½ × 38",  width: 11.5, length: 38,   quantity: 1, category: "narrow"   },
  { id: "p13", label: "48 × 24",   width: 48,   length: 24,   quantity: 1, category: "large"    },
  { id: "p14", label: "40 × 12",   width: 40,   length: 12,   quantity: 1, category: "large"    },
  { id: "p15", label: "48 × 11½",  width: 48,   length: 11.5, quantity: 1, category: "narrow"   },
  { id: "p16", label: "38 × 12",   width: 38,   length: 12,   quantity: 1, category: "large"    },
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

// ─── Props ────────────────────────────────────────────────────────────────────
interface PresetDimensionSelectorProps {
  onApply?: (dims: { width: number; length: number; quantity: number }) => void;
  rollWidth?:  number;
  rollLength?: number;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PresetDimensionSelector({
  onApply,
  rollWidth  = 72,
  rollLength = 144,
}: PresetDimensionSelectorProps) {

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [filter,  setFilter]  = useState<"all" | PresetDimension["category"]>("all");

  const toggle    = (id: string) =>
    setChecked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const selectAll = () => setChecked(new Set(PRESET_DIMENSIONS.map(p => p.id)));
  const clearAll  = () => setChecked(new Set());

  const selectedPresets = PRESET_DIMENSIONS.filter(p => checked.has(p.id));
  const totalArea = selectedPresets.reduce(
    (acc, p) => acc + (p.width * p.length * p.quantity) / 144, 0
  );
  const visible = filter === "all"
    ? PRESET_DIMENSIONS
    : PRESET_DIMENSIONS.filter(p => p.category === filter);

  const handleApply = () => {
    if (!onApply || selectedPresets.length === 0) return;
    const first = selectedPresets[0];
    onApply({ width: first.width, length: first.length, quantity: first.quantity });
  };

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

        {/* Select / Clear all */}
        <div className="flex items-center gap-3 pt-1">
          <button onClick={selectAll} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
            <CheckSquare className="h-3 w-3" /> Select all
          </button>
          <span className="text-slate-300">|</span>
          <button onClick={clearAll} className="flex items-center gap-1 text-xs text-slate-500 hover:underline">
            <Square className="h-3 w-3" /> Clear
          </button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">

        {/* ── Preset grid ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {visible.map(preset => {
            const isChecked = checked.has(preset.id);
            return (
              <label
                key={preset.id}
                className={`
                  flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer
                  transition-all duration-150 select-none
                  ${isChecked
                    ? `${CAT_CARD[preset.category]} shadow-sm ring-1 ring-inset ring-current/20`
                    : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }
                `}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(preset.id)}
                  className="sr-only"
                />

                {/* Custom checkbox */}
                <span className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border-2 flex items-center
                                  justify-center transition-colors ${
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
                    {((preset.width * preset.length * preset.quantity) / 144).toFixed(1)} sq ft
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        {/* ── Selection summary ── */}
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

            {/* Dimension summary table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-1 pr-3 font-semibold text-slate-600">Dimensions</th>
                    <th className="text-right py-1 pr-3 font-semibold text-slate-600">Qty</th>
                    <th className="text-right py-1 font-semibold text-slate-600">Sq ft each</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPresets.map(p => (
                    <tr key={p.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-1 pr-3 font-mono font-semibold text-slate-800">{p.label}"</td>
                      <td className="py-1 pr-3 text-right text-slate-600">{p.quantity}</td>
                      <td className="py-1 text-right text-slate-600">
                        {((p.width * p.length) / 144).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-100">
                    <td colSpan={2} className="py-1 pr-3 font-semibold text-slate-700">Total</td>
                    <td className="py-1 text-right font-semibold text-slate-700">
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