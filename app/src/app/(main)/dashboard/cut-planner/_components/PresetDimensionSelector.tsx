"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Scissors, LayoutGrid } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface PresetDimension {
  id:       string;
  label:    string;
  width:    number;
  length:   number;
  quantity: number;
  category: "standard" | "large" | "narrow";
}

type Category = PresetDimension["category"];

export const PRESET_DIMENSIONS: PresetDimension[] = [
  { id: "p1",  label: "18 × 14",  width: 18,   length: 14,   quantity: 1, category: "standard" },
  { id: "p2",  label: "24 × 50",  width: 24,   length: 50,   quantity: 1, category: "large"    },
  { id: "p3",  label: "24 × 14",  width: 24,   length: 14,   quantity: 1, category: "standard" },
  { id: "p4",  label: "24 × 40",  width: 24,   length: 40,   quantity: 1, category: "large"    },
  { id: "p5",  label: "12 × 24",  width: 12,   length: 24,   quantity: 1, category: "standard" },
  { id: "p6",  label: "11½ × 40", width: 11.5, length: 40,   quantity: 1, category: "narrow"   },
  { id: "p7",  label: "11½ × 12", width: 11.5, length: 12,   quantity: 1, category: "narrow"   },
  { id: "p8",  label: "56 × 12",  width: 56,   length: 12,   quantity: 1, category: "large"    },
  { id: "p9",  label: "12 × 11½", width: 12,   length: 11.5, quantity: 1, category: "narrow"   },
  { id: "p10", label: "72 × 12",  width: 72,   length: 12,   quantity: 1, category: "large"    },
  { id: "p11", label: "38 × 24",  width: 38,   length: 24,   quantity: 1, category: "large"    },
  { id: "p12", label: "11½ × 38", width: 11.5, length: 38,   quantity: 1, category: "narrow"   },
  { id: "p13", label: "48 × 24",  width: 48,   length: 24,   quantity: 1, category: "large"    },
  { id: "p14", label: "40 × 12",  width: 40,   length: 12,   quantity: 1, category: "large"    },
  { id: "p15", label: "48 × 11½", width: 48,   length: 11.5, quantity: 1, category: "narrow"   },
  { id: "p16", label: "38 × 12",  width: 38,   length: 12,   quantity: 1, category: "large"    },
];

// ─── Category accent colours (border + text only — no background fill) ────────
const CAT_ACCENT: Record<Category, { border: string; text: string; dot: string }> = {
  standard: { border: "var(--color-border-info)",    text: "var(--color-text-info)",    dot: "var(--color-border-info)"    },
  large:    { border: "#7c3aed",                     text: "#7c3aed",                   dot: "#7c3aed"                     },
  narrow:   { border: "var(--color-border-warning)", text: "var(--color-text-warning)", dot: "var(--color-border-warning)" },
};

const CAT_LABELS: Record<"all" | Category, string> = {
  all:      "All",
  standard: "Standard",
  large:    "Large",
  narrow:   "Narrow",
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
}: PresetDimensionSelectorProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [filter,  setFilter]  = useState<"all" | Category>("all");

  const toggle = (id: string) =>
    setChecked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const selectedPresets = PRESET_DIMENSIONS.filter(p => checked.has(p.id));
  const visible = filter === "all"
    ? PRESET_DIMENSIONS
    : PRESET_DIMENSIONS.filter(p => p.category === filter);

  // Apply the single checked preset to the form and clear selection
  const handleApply = () => {
    if (!onApply || selectedPresets.length === 0) return;
    const p = selectedPresets[0];
    onApply({ width: p.width, length: p.length, quantity: p.quantity });
    setChecked(new Set());
  };

  const hasSelection = selectedPresets.length > 0;

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        {/* ── Title + filter tabs on one line ── */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <LayoutGrid className="h-4 w-4 text-muted-foreground" />
            Cut Presets
            <span className="text-xs font-normal text-muted-foreground">
              — pick a size to pre-fill the form
            </span>
          </CardTitle>

          {/* Filter tabs — inline segment control */}
          <div
            className="flex rounded-md border border-border overflow-hidden text-xs"
            role="group"
          >
            {(["all", "standard", "large", "narrow"] as const).map(cat => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className="px-3 py-1 font-medium transition-colors border-r border-border last:border-r-0"
                style={
                  filter === cat
                    ? { background: "var(--color-background-secondary)", color: "var(--color-text-primary)" }
                    : { background: "transparent",                        color: "var(--color-text-tertiary)"  }
                }
              >
                {CAT_LABELS[cat]}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-1">

        {/* ── Preset grid ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5">
          {visible.map(preset => {
            const isChecked = checked.has(preset.id);
            const accent    = CAT_ACCENT[preset.category];
            return (
              <label
                key={preset.id}
                title={`${preset.label}" — ${((preset.width * preset.length) / 144).toFixed(1)} sq ft`}
                className="relative flex flex-col items-start gap-0.5 px-2.5 py-2 rounded-md
                           border cursor-pointer select-none transition-all duration-100"
                style={
                  isChecked
                    ? { borderColor: accent.border, background: "var(--color-background-secondary)", color: accent.text }
                    : { borderColor: "var(--color-border-tertiary)", background: "transparent", color: "var(--color-text-primary)" }
                }
                onMouseEnter={e => {
                  if (!isChecked)
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--color-border-secondary)";
                }}
                onMouseLeave={e => {
                  if (!isChecked)
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--color-border-tertiary)";
                }}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(preset.id)}
                  className="sr-only"
                />

                {/* Checked indicator dot — top-right corner */}
                {isChecked && (
                  <span
                    className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
                    style={{ background: accent.dot }}
                  />
                )}

                {/* Dimension label — primary info */}
                <span className="font-mono text-[13px] font-semibold leading-tight tracking-tight">
                  {preset.label}"
                </span>

                {/* Sq ft — secondary info */}
                <span className="text-[10px] text-muted-foreground leading-none">
                  {((preset.width * preset.length) / 144).toFixed(1)} ft²
                </span>
              </label>
            );
          })}
        </div>

        {/* ── Selection bar — only shows when something is checked ── */}
        {hasSelection && (
          <div className="flex items-center justify-between gap-3 px-3 py-2
                          rounded-md border border-border bg-muted/40">
            {/* Left: what's selected */}
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <Scissors className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <div className="flex items-center gap-1.5 flex-wrap">
                {selectedPresets.map(p => (
                  <button
                    key={p.id}
                    onClick={() => toggle(p.id)}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px]
                               font-mono font-medium border transition-opacity hover:opacity-60"
                    style={CAT_ACCENT[p.category]
                      ? { borderColor: CAT_ACCENT[p.category].border, color: CAT_ACCENT[p.category].text, background: "transparent" }
                      : {}}
                    title="Click to deselect"
                  >
                    {p.label}"
                    <span className="opacity-40 text-[10px]">✕</span>
                  </button>
                ))}
              </div>
              {selectedPresets.length > 1 && (
                <span className="text-[11px] text-muted-foreground">
                  ({selectedPresets.length} selected — first will be used)
                </span>
              )}
            </div>

            {/* Right: action buttons */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setChecked(new Set())}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>
              {onApply && (
                <Button size="sm" onClick={handleApply}>
                  Apply to form
                </Button>
              )}
            </div>
          </div>
        )}

      </CardContent>
    </Card>
  );
}