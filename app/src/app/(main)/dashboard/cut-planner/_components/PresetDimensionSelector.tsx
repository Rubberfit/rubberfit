"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  getLocalStorageValue,
  removeLocalStorageValue,
  setLocalStorageValue,
} from "@/lib/local-storage.client";
import { CheckSquare, LayoutGrid, Pencil, Scissors, Shapes, Square, Triangle } from "lucide-react";
import type { SimplePartType } from "./NestingVisualizer";

type TemplateCategory = "standard" | "large" | "narrow" | "custom";
type SupportedPartType = Exclude<SimplePartType, "circle">;

export interface PartTemplate {
  id: string;
  partType: SimplePartType;
  label: string;
  summary: string;
  quantity: number;
  category: TemplateCategory;
  width?: number;
  length?: number;
  diameter?: number;
  height?: number;
  topWidth?: number;
  bottomWidth?: number;
  innerRadius?: number;
  outerRadius?: number;
  arcDegrees?: number;
  isCustom?: boolean;
}

type RectangleDraft = { width: string; length: string };
type CylinderDraft = { diameter: string; height: string };
type ConeDraft = { innerRadius: string; outerRadius: string; arcDegrees: string };
type TrapezoidDraft = { topWidth: string; bottomWidth: string; height: string };

type CustomPartDrafts = {
  rectangle: RectangleDraft;
  cylinder: CylinderDraft;
  cone: ConeDraft;
  trapezoid: TrapezoidDraft;
};

type CustomTemplateMap = Record<SupportedPartType, PartTemplate[]>;

const PART_OPTIONS: Array<{
  partType: SupportedPartType;
  label: string;
  description: string;
}> = [
  {
    partType: "rectangle",
    label: "Rectangles / Strips",
    description: "Flat pads, strips, and standard rectangular cuts.",
  },
  {
    partType: "cylinder",
    label: "Cylinder Wraps",
    description: "Cylindrical wraps and liner bodies.",
  },
  {
    partType: "cone",
    label: "Cone Spreads",
    description: "Flattened cone/frustum profiles.",
  },
  {
    partType: "trapezoid",
    label: "Hopper / Transition Panels",
    description: "Trapezoids and transition-panel layouts.",
  },
];

export const PART_TEMPLATES: PartTemplate[] = [
  { id: "rect-18x14", partType: "rectangle", label: '18" × 14"', summary: "Standard cut preset", quantity: 1, category: "standard", width: 18, length: 14 },
  { id: "rect-24x50", partType: "rectangle", label: '24" × 50"', summary: "Large cut preset", quantity: 1, category: "large", width: 24, length: 50 },
  { id: "rect-11-5x50", partType: "rectangle", label: '11½" × 50"', summary: "Narrow cut preset", quantity: 1, category: "narrow", width: 11.5, length: 50 },
  { id: "rect-24x14", partType: "rectangle", label: '24" × 14"', summary: "Standard cut preset", quantity: 1, category: "standard", width: 24, length: 14 },
  { id: "rect-24x40", partType: "rectangle", label: '24" × 40"', summary: "Large cut preset", quantity: 1, category: "large", width: 24, length: 40 },
  { id: "rect-12x24", partType: "rectangle", label: '12" × 24"', summary: "Standard cut preset", quantity: 1, category: "standard", width: 12, length: 24 },
  { id: "rect-11-5x40", partType: "rectangle", label: '11½" × 40"', summary: "Narrow cut preset", quantity: 1, category: "narrow", width: 11.5, length: 40 },
  { id: "rect-11-5x12", partType: "rectangle", label: '11½" × 12"', summary: "Narrow cut preset", quantity: 1, category: "narrow", width: 11.5, length: 12 },
  { id: "rect-56x12", partType: "rectangle", label: '56" × 12"', summary: "Large cut preset", quantity: 1, category: "large", width: 56, length: 12 },
  { id: "rect-12x11-5", partType: "rectangle", label: '12" × 11½"', summary: "Narrow cut preset", quantity: 1, category: "narrow", width: 12, length: 11.5 },
  { id: "rect-72x12", partType: "rectangle", label: '72" × 12"', summary: "Large cut preset", quantity: 1, category: "large", width: 72, length: 12 },
  { id: "rect-38x24", partType: "rectangle", label: '38" × 24"', summary: "Large cut preset", quantity: 1, category: "large", width: 38, length: 24 },
  { id: "rect-11-5x38", partType: "rectangle", label: '11½" × 38"', summary: "Narrow cut preset", quantity: 1, category: "narrow", width: 11.5, length: 38 },
  { id: "rect-48x24", partType: "rectangle", label: '48" × 24"', summary: "Large cut preset", quantity: 1, category: "large", width: 48, length: 24 },
  { id: "rect-40x12", partType: "rectangle", label: '40" × 12"', summary: "Large cut preset", quantity: 1, category: "large", width: 40, length: 12 },
  { id: "rect-48x11-5", partType: "rectangle", label: '48" × 11½"', summary: "Narrow cut preset", quantity: 1, category: "narrow", width: 48, length: 11.5 },
  { id: "rect-38x12", partType: "rectangle", label: '38" × 12"', summary: "Large cut preset", quantity: 1, category: "large", width: 38, length: 12 },

  { id: "cyl-12x18", partType: "cylinder", label: 'Ø12" × 18"', summary: "Cylinder liner wrap", quantity: 1, category: "standard", diameter: 12, height: 18 },
  { id: "cyl-18x24", partType: "cylinder", label: 'Ø18" × 24"', summary: "Cylinder liner wrap", quantity: 1, category: "standard", diameter: 18, height: 24 },
  { id: "cyl-18x36", partType: "cylinder", label: 'Ø18" × 36"', summary: "Cylinder liner wrap", quantity: 1, category: "standard", diameter: 18, height: 36 },
  { id: "cyl-24x40", partType: "cylinder", label: 'Ø24" × 40"', summary: "Cylinder liner wrap", quantity: 1, category: "large", diameter: 24, height: 40 },
  { id: "cyl-24x50", partType: "cylinder", label: 'Ø24" × 50"', summary: "Cylinder liner wrap", quantity: 1, category: "large", diameter: 24, height: 50 },
  { id: "cyl-30x48", partType: "cylinder", label: 'Ø30" × 48"', summary: "Cylinder liner wrap", quantity: 1, category: "large", diameter: 30, height: 48 },
  { id: "cyl-36x38", partType: "cylinder", label: 'Ø36" × 38"', summary: "Cylinder liner wrap", quantity: 1, category: "large", diameter: 36, height: 38 },
  { id: "cyl-42x42", partType: "cylinder", label: 'Ø42" × 42"', summary: "Oversize cylinder liner", quantity: 1, category: "large", diameter: 42, height: 42 },
  { id: "cyl-48x60", partType: "cylinder", label: 'Ø48" × 60"', summary: "Oversize cylinder liner", quantity: 1, category: "large", diameter: 48, height: 60 },

  { id: "cone-90", partType: "cone", label: '90° • R8" to R22"', summary: "Cone/frustum spread", quantity: 1, category: "standard", innerRadius: 8, outerRadius: 22, arcDegrees: 90 },
  { id: "cone-100", partType: "cone", label: '100° • R10" to R24"', summary: "Cone/frustum spread", quantity: 1, category: "standard", innerRadius: 10, outerRadius: 24, arcDegrees: 100 },
  { id: "cone-120", partType: "cone", label: '120° • R10" to R28"', summary: "Cone/frustum spread", quantity: 1, category: "standard", innerRadius: 10, outerRadius: 28, arcDegrees: 120 },
  { id: "cone-130", partType: "cone", label: '130° • R12" to R26"', summary: "Cone/frustum spread", quantity: 1, category: "standard", innerRadius: 12, outerRadius: 26, arcDegrees: 130 },
  { id: "cone-140", partType: "cone", label: '140° • R12" to R30"', summary: "Cone/frustum spread", quantity: 1, category: "large", innerRadius: 12, outerRadius: 30, arcDegrees: 140 },
  { id: "cone-150", partType: "cone", label: '150° • R14" to R32"', summary: "Cone/frustum spread", quantity: 1, category: "large", innerRadius: 14, outerRadius: 32, arcDegrees: 150 },
  { id: "cone-160", partType: "cone", label: '160° • R16" to R34"', summary: "Cone/frustum spread", quantity: 1, category: "large", innerRadius: 16, outerRadius: 34, arcDegrees: 160 },
  { id: "cone-180", partType: "cone", label: '180° • R18" to R38"', summary: "Cone/frustum spread", quantity: 1, category: "large", innerRadius: 18, outerRadius: 38, arcDegrees: 180 },
  { id: "cone-200", partType: "cone", label: '200° • R18" to R36"', summary: "Wide cone/frustum spread", quantity: 1, category: "large", innerRadius: 18, outerRadius: 36, arcDegrees: 200 },
  { id: "cone-220", partType: "cone", label: '220° • R20" to R40"', summary: "Wide cone/frustum spread", quantity: 1, category: "large", innerRadius: 20, outerRadius: 40, arcDegrees: 220 },
  { id: "cone-240", partType: "cone", label: '240° • R22" to R44"', summary: "Wide cone/frustum spread", quantity: 1, category: "large", innerRadius: 22, outerRadius: 44, arcDegrees: 240 },

  { id: "trap-16-22-36", partType: "trapezoid", label: '16" / 22" × 36"', summary: "Hopper side panel", quantity: 1, category: "standard", topWidth: 16, bottomWidth: 22, height: 36 },
  { id: "trap-18-24-42", partType: "trapezoid", label: '18" / 24" × 42"', summary: "Hopper side panel", quantity: 1, category: "standard", topWidth: 18, bottomWidth: 24, height: 42 },
  { id: "trap-20-28-40", partType: "trapezoid", label: '20" / 28" × 40"', summary: "Hopper side panel", quantity: 1, category: "standard", topWidth: 20, bottomWidth: 28, height: 40 },
  { id: "trap-24-30-48", partType: "trapezoid", label: '24" / 30" × 48"', summary: "Hopper side panel", quantity: 1, category: "large", topWidth: 24, bottomWidth: 30, height: 48 },
  { id: "trap-22-34-52", partType: "trapezoid", label: '22" / 34" × 52"', summary: "Transition panel", quantity: 1, category: "large", topWidth: 22, bottomWidth: 34, height: 52 },
  { id: "trap-24-36-56", partType: "trapezoid", label: '24" / 36" × 56"', summary: "Transition panel", quantity: 1, category: "large", topWidth: 24, bottomWidth: 36, height: 56 },
  { id: "trap-26-38-58", partType: "trapezoid", label: '26" / 38" × 58"', summary: "Transition panel", quantity: 1, category: "large", topWidth: 26, bottomWidth: 38, height: 58 },
  { id: "trap-30-42-60", partType: "trapezoid", label: '30" / 42" × 60"', summary: "Large transition panel", quantity: 1, category: "large", topWidth: 30, bottomWidth: 42, height: 60 },
];

const CAT_CARD: Record<TemplateCategory, string> = {
  standard: "bg-blue-50 border-blue-200 text-blue-800",
  large: "bg-purple-50 border-purple-200 text-purple-800",
  narrow: "bg-amber-50 border-amber-200 text-amber-800",
  custom: "bg-emerald-50 border-emerald-200 text-emerald-800",
};

const CAT_BADGE: Record<TemplateCategory, string> = {
  standard: "bg-blue-100 text-blue-700",
  large: "bg-purple-100 text-purple-700",
  narrow: "bg-amber-100 text-amber-700",
  custom: "bg-emerald-100 text-emerald-700",
};

const DEFAULT_CUSTOM_DRAFTS: CustomPartDrafts = {
  rectangle: { width: "", length: "" },
  cylinder: { diameter: "", height: "" },
  cone: { innerRadius: "", outerRadius: "", arcDegrees: "" },
  trapezoid: { topWidth: "", bottomWidth: "", height: "" },
};

const EMPTY_CUSTOM_TEMPLATES: CustomTemplateMap = {
  rectangle: [],
  cylinder: [],
  cone: [],
  trapezoid: [],
};

const CUSTOM_TEMPLATE_STORAGE_KEY = "rubberfit-pro.cut-planner.custom-templates.v1";

function formatInches(value: number) {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d*[1-9])0+$/, "$1");
}

function parsePositiveMeasurement(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function buildCustomTemplate(
  partType: SupportedPartType,
  drafts: CustomPartDrafts,
): PartTemplate | null {
  switch (partType) {
    case "rectangle": {
      const width = parsePositiveMeasurement(drafts.rectangle.width);
      const length = parsePositiveMeasurement(drafts.rectangle.length);
      if (!width || !length) {
        return null;
      }

      return {
        id: `custom-rectangle-${width}-${length}`,
        partType,
        label: `${formatInches(width)}" × ${formatInches(length)}"`,
        summary: "Custom rectangular cut",
        quantity: 1,
        category: "custom",
        width,
        length,
        isCustom: true,
      };
    }
    case "cylinder": {
      const diameter = parsePositiveMeasurement(drafts.cylinder.diameter);
      const height = parsePositiveMeasurement(drafts.cylinder.height);
      if (!diameter || !height) {
        return null;
      }

      return {
        id: `custom-cylinder-${diameter}-${height}`,
        partType,
        label: `Ø${formatInches(diameter)}" × ${formatInches(height)}"`,
        summary: "Custom cylinder wrap",
        quantity: 1,
        category: "custom",
        diameter,
        height,
        isCustom: true,
      };
    }
    case "cone": {
      const innerRadius = parsePositiveMeasurement(drafts.cone.innerRadius);
      const outerRadius = parsePositiveMeasurement(drafts.cone.outerRadius);
      const arcDegrees = parsePositiveMeasurement(drafts.cone.arcDegrees);
      if (!innerRadius || !outerRadius || !arcDegrees || outerRadius <= innerRadius) {
        return null;
      }

      return {
        id: `custom-cone-${innerRadius}-${outerRadius}-${arcDegrees}`,
        partType,
        label: `${formatInches(arcDegrees)}° • R${formatInches(innerRadius)}" to R${formatInches(outerRadius)}"`,
        summary: "Custom cone/frustum spread",
        quantity: 1,
        category: "custom",
        innerRadius,
        outerRadius,
        arcDegrees,
        isCustom: true,
      };
    }
    case "trapezoid": {
      const topWidth = parsePositiveMeasurement(drafts.trapezoid.topWidth);
      const bottomWidth = parsePositiveMeasurement(drafts.trapezoid.bottomWidth);
      const height = parsePositiveMeasurement(drafts.trapezoid.height);
      if (!topWidth || !bottomWidth || !height) {
        return null;
      }

      return {
        id: `custom-trapezoid-${topWidth}-${bottomWidth}-${height}`,
        partType,
        label: `${formatInches(topWidth)}" / ${formatInches(bottomWidth)}" × ${formatInches(height)}"`,
        summary: "Custom hopper / transition panel",
        quantity: 1,
        category: "custom",
        topWidth,
        bottomWidth,
        height,
        isCustom: true,
      };
    }
    default:
      return null;
  }
}

function templateToDraft(template: PartTemplate): CustomPartDrafts[SupportedPartType] {
  switch (template.partType) {
    case "cylinder":
      return {
        diameter: template.diameter ? formatInches(template.diameter) : "",
        height: template.height ? formatInches(template.height) : "",
      };
    case "cone":
      return {
        innerRadius: template.innerRadius ? formatInches(template.innerRadius) : "",
        outerRadius: template.outerRadius ? formatInches(template.outerRadius) : "",
        arcDegrees: template.arcDegrees ? formatInches(template.arcDegrees) : "",
      };
    case "trapezoid":
      return {
        topWidth: template.topWidth ? formatInches(template.topWidth) : "",
        bottomWidth: template.bottomWidth ? formatInches(template.bottomWidth) : "",
        height: template.height ? formatInches(template.height) : "",
      };
    case "rectangle":
    default:
      return {
        width: template.width ? formatInches(template.width) : "",
        length: template.length ? formatInches(template.length) : "",
      };
  }
}

function getPartIcon(partType: SimplePartType) {
  if (partType === "cone" || partType === "trapezoid") return Triangle;
  return Shapes;
}

function getTemplateAreaSqFt(template: PartTemplate) {
  switch (template.partType) {
    case "circle": {
      const radius = (template.diameter ?? 0) / 2;
      return (Math.PI * radius * radius * template.quantity) / 144;
    }
    case "cylinder": {
      const diameter = template.diameter ?? 0;
      const height = template.height ?? 0;
      return (Math.PI * diameter * height * template.quantity) / 144;
    }
    case "cone": {
      const innerRadius = template.innerRadius ?? 0;
      const outerRadius = template.outerRadius ?? 0;
      const arcDegrees = template.arcDegrees ?? 0;
      return ((arcDegrees / 360) * Math.PI * (outerRadius ** 2 - innerRadius ** 2) * template.quantity) / 144;
    }
    case "trapezoid": {
      const topWidth = template.topWidth ?? 0;
      const bottomWidth = template.bottomWidth ?? 0;
      const height = template.height ?? 0;
      return (((topWidth + bottomWidth) / 2) * height * template.quantity) / 144;
    }
    case "rectangle":
    default:
      return ((template.width ?? 0) * (template.length ?? 0) * template.quantity) / 144;
  }
}

interface PresetDimensionSelectorProps {
  onApply?: (templates: PartTemplate[]) => void;
  rollWidth?: number;
  rollLength?: number;
}

export default function PresetDimensionSelector({
  onApply,
  rollWidth = 96,
  rollLength = 48,
}: PresetDimensionSelectorProps) {
  const [selectedPart, setSelectedPart] = useState<SupportedPartType>("rectangle");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | TemplateCategory>("all");
  const [customDrafts, setCustomDrafts] = useState<CustomPartDrafts>(DEFAULT_CUSTOM_DRAFTS);
  const [customTemplates, setCustomTemplates] = useState<CustomTemplateMap>(EMPTY_CUSTOM_TEMPLATES);
  const [nextCustomId, setNextCustomId] = useState(1);
  const [editingCustomId, setEditingCustomId] = useState<string | null>(null);

  useEffect(() => {
    const raw = getLocalStorageValue(CUSTOM_TEMPLATE_STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<CustomTemplateMap>;
      const hydrated: CustomTemplateMap = {
        rectangle: Array.isArray(parsed.rectangle) ? parsed.rectangle : [],
        cylinder: Array.isArray(parsed.cylinder) ? parsed.cylinder : [],
        cone: Array.isArray(parsed.cone) ? parsed.cone : [],
        trapezoid: Array.isArray(parsed.trapezoid) ? parsed.trapezoid : [],
      };

      setCustomTemplates(hydrated);

      const maxId = Object.values(hydrated)
        .flat()
        .reduce((highest, template) => {
          const match = template.id.match(/custom-[a-z-]+-(\d+)$/);
          const numericId = match ? Number.parseInt(match[1] ?? "0", 10) : 0;
          return Number.isFinite(numericId) ? Math.max(highest, numericId) : highest;
        }, 0);

      setNextCustomId(maxId + 1);
    } catch {
      removeLocalStorageValue(CUSTOM_TEMPLATE_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    setLocalStorageValue(
      CUSTOM_TEMPLATE_STORAGE_KEY,
      JSON.stringify(customTemplates),
    );
  }, [customTemplates]);

  const sizeOptions = useMemo(
    () => [
      ...PART_TEMPLATES.filter((template) => template.partType === selectedPart),
      ...customTemplates[selectedPart],
    ],
    [customTemplates, selectedPart]
  );

  const availableCategories = useMemo(() => {
    const categories = new Set<TemplateCategory>();
    sizeOptions.forEach((template) => categories.add(template.category));
    return ["all", ...Array.from(categories)] as Array<"all" | TemplateCategory>;
  }, [sizeOptions]);

  const visible = filter === "all"
    ? sizeOptions
    : sizeOptions.filter((template) => template.category === filter);

  const selectedTemplates = useMemo(
    () =>
      Array.from(checked)
        .map((id) => sizeOptions.find((template) => template.id === id) ?? null)
        .filter((template): template is PartTemplate => template !== null),
    [checked, sizeOptions]
  );

  const pendingCustomTemplate = useMemo(
    () => buildCustomTemplate(selectedPart, customDrafts),
    [customDrafts, selectedPart]
  );

  const totalArea = selectedTemplates.reduce((acc, template) => acc + getTemplateAreaSqFt(template), 0);

  useEffect(() => {
    onApply?.(selectedTemplates);
  }, [onApply, selectedTemplates]);

  const handlePartChange = (partType: SupportedPartType) => {
    setSelectedPart(partType);
    setChecked(new Set());
    setFilter("all");
    setEditingCustomId(null);
  };

  const handleToggle = (templateId: string) => {
    setChecked((previous) => {
      const next = new Set(previous);
      if (next.has(templateId)) {
        next.delete(templateId);
      } else {
        next.add(templateId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setChecked(new Set(sizeOptions.map((template) => template.id)));
  };

  const handleClearAll = () => {
    setChecked(new Set());
  };

  const updateCustomDraft = (
    key: string,
    value: string,
  ) => {
    setCustomDrafts((previous) => ({
      ...previous,
      [selectedPart]: {
        ...previous[selectedPart],
        [key]: value,
      },
    }));
  };

  const customDraft = customDrafts[selectedPart];
  const selectedPartLabel = PART_OPTIONS.find((part) => part.partType === selectedPart)?.label ?? "Part";
  const savedCustomCount = customTemplates[selectedPart].length;
  const customFields = (() => {
    switch (selectedPart) {
      case "cylinder":
        return [
          { key: "diameter", label: "Diameter", placeholder: '24' },
          { key: "height", label: "Height", placeholder: '40' },
        ];
      case "cone":
        return [
          { key: "innerRadius", label: "Inner Radius", placeholder: '10' },
          { key: "outerRadius", label: "Outer Radius", placeholder: '24' },
          { key: "arcDegrees", label: "Arc Degrees", placeholder: '100' },
        ];
      case "trapezoid":
        return [
          { key: "topWidth", label: "Top Width", placeholder: '24' },
          { key: "bottomWidth", label: "Bottom Width", placeholder: '36' },
          { key: "height", label: "Height", placeholder: '56' },
        ];
      case "rectangle":
      default:
        return [
          { key: "width", label: "Width", placeholder: '24' },
          { key: "length", label: "Length", placeholder: '50' },
        ];
    }
  })();

  const handleAddCustomSize = () => {
    if (!pendingCustomTemplate) {
      return;
    }

    if (editingCustomId) {
      const customTemplate: PartTemplate = {
        ...pendingCustomTemplate,
        id: editingCustomId,
      };

      setCustomTemplates((previous) => ({
        ...previous,
        [selectedPart]: previous[selectedPart].map((template) =>
          template.id === editingCustomId ? customTemplate : template
        ),
      }));
      setEditingCustomId(null);
    } else {
      const id = `custom-${selectedPart}-${nextCustomId}`;
      const customTemplate: PartTemplate = {
        ...pendingCustomTemplate,
        id,
      };

      setCustomTemplates((previous) => ({
        ...previous,
        [selectedPart]: [...previous[selectedPart], customTemplate],
      }));
      setChecked((previous) => {
        const next = new Set(previous);
        next.add(id);
        return next;
      });
      setNextCustomId((previous) => previous + 1);
    }

    setFilter("all");
    setCustomDrafts((previous) => ({
      ...previous,
      [selectedPart]: DEFAULT_CUSTOM_DRAFTS[selectedPart],
    }));
  };

  const editCustomTemplate = (template: PartTemplate) => {
    setEditingCustomId(template.id);
    setFilter("all");
    setCustomDrafts((previous) => ({
      ...previous,
      [selectedPart]: templateToDraft(template),
    }));
  };

  const removeCustomTemplate = (templateId: string) => {
    setCustomTemplates((previous) => ({
      ...previous,
      [selectedPart]: previous[selectedPart].filter((template) => template.id !== templateId),
    }));
    setChecked((previous) => {
      const next = new Set(previous);
      next.delete(templateId);
      return next;
    });
    if (editingCustomId === templateId) {
      setEditingCustomId(null);
      setCustomDrafts((previous) => ({
        ...previous,
        [selectedPart]: DEFAULT_CUSTOM_DRAFTS[selectedPart],
      }));
    }
  };

  return (
    <Card className="w-full shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <LayoutGrid className="h-4 w-4 text-slate-500" />
            Part Selection
          </CardTitle>
          <div className="text-xs text-slate-500">
            Preview stock: {rollWidth}" × {rollLength}"
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            1. Choose Part Type
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {PART_OPTIONS.map((part) => {
              const Icon = getPartIcon(part.partType);
              const isSelected = part.partType === selectedPart;

              return (
                <button
                  key={part.partType}
                  type="button"
                  onClick={() => handlePartChange(part.partType)}
                  className={`rounded-lg border p-3 text-left transition-all ${
                    isSelected
                      ? "border-blue-500 bg-blue-50 text-blue-900 ring-1 ring-blue-200 dark:bg-white/5 text-slate-100"
                      : "border-slate-300 bg-white hover:bg-slate-50 dark:bg-card dark:border-slate-700 dark:hover:bg-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full border ${
                        isSelected ? "border-blue-200 bg-blue-200 dark:text-slate-100 dark:bg-card" : "border-slate-100 bg-slate-50 dark:text-slate-100 dark:bg-card"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{part.label}</span>
                  </div>
                  <div className={`mt-2 text-xs ${isSelected ? "text-blue-700 dark:text-slate-300" : "text-slate-500 dark:text-slate-400 "}`}>
                    {part.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              2. Choose Standard Size
            </div>

            <div className="flex gap-1.5 flex-wrap ">
              {availableCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setFilter(category)}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                    filter === category
                      ? "bg-slate-800 text-white border-slate-800 dark:bg-slate-100 dark:text-slate-800 dark:border-slate-100"
                      : "bg-white text-slate-500 border-slate-200 hover:border-slate-400 dark:bg-card dark:text-slate-400 dark:border-slate-700 dark:hover:border-slate-500"
                  }`}
                >
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleSelectAll}
              className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
            >
              <CheckSquare className="h-3 w-3" /> Select all
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={handleClearAll}
              className="flex items-center gap-1 text-xs text-slate-500 hover:underline"
            >
              <Square className="h-3 w-3" /> Clear
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((template) => {
              const isChecked = checked.has(template.id);
              return (
                <label
                  key={template.id}
                  className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all duration-150 select-none ${
                    isChecked
                      ? `  border-blue-400 text-blue-900 shadow-sm ring-1 ring-inset ring-blue-200`
                      : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50 dark:bg-card dark:text-slate-100 dark:border-slate-700 dark:hover:bg-slate-700"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleToggle(template.id)}
                    className="sr-only"
                  />

                  <span
                    className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                      isChecked
                        ? "border-blue-600 bg-blue-600"
                        : "border-slate-100 bg-white dark:border-slate-700 dark:bg-slate-700"
                    }`}
                  >
                    {isChecked && (
                      <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white fill-white">
                        <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" />
                      </svg>
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-1.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-sm font-semibold leading-tight">
                            {template.label}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${CAT_BADGE[template.category]}`}>
                            {template.category}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5  dark:text-slate-100">
                          {getTemplateAreaSqFt(template).toFixed(1)} sq ft
                        </div>
                        {editingCustomId === template.id && (
                          <div className="mt-1 text-[10px] font-medium text-blue-700">
                            Editing
                          </div>
                        )}
                      </div>
                      {template.isCustom && (
                        <div className="ml-auto flex flex-col items-end gap-1">
                          <button
                            type="button"
                            aria-label={`Edit ${template.label}`}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              editCustomTemplate(template);
                            }}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              removeCustomTemplate(template.id);
                            }}
                            className="text-[10px] px-1.5 py-0.5 rounded-full font-medium border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          >
                            remove
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3 dark:bg-card">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Custom Size
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                  If the standard list does not match the rubber on hand, enter a custom {selectedPartLabel.toLowerCase()} size.
                </div>
                {savedCustomCount > 0 && (
                  <div className="mt-1 text-xs text-emerald-700">
                    {savedCustomCount} saved custom size{savedCustomCount > 1 ? "s" : ""} for this part type.
                  </div>
                )}
                {editingCustomId && (
                  <div className="mt-1 text-xs text-blue-700">
                    Editing saved custom size.
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {editingCustomId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCustomId(null);
                      setCustomDrafts((previous) => ({
                        ...previous,
                        [selectedPart]: DEFAULT_CUSTOM_DRAFTS[selectedPart],
                      }));
                    }}
                    className="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors border-slate-200 bg-white text-slate-600 enabled:hover:border-slate-300 dark:border-slate-700 dark:bg-slate-700/50 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAddCustomSize}
                  disabled={!pendingCustomTemplate}
                  className="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors border-slate-200 bg-white text-slate-600 enabled:hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-700/50 dark:text-slate-300"
                >
                  {editingCustomId ? "Save Changes" : "Add Custom Size"}
                </button>
              </div>
            </div>

            <div className={`grid gap-3 ${customFields.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
              {customFields.map((field) => (
                <div key={field.key}>
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    {field.label}
                  </div>
                  <Input
                    min={0}
                    step="0.5"
                    type="number"
                    value={(customDraft as Record<string, string>)[field.key] ?? ""}
                    onChange={(event) => updateCustomDraft(field.key, event.target.value)}
                    placeholder={field.placeholder}
                  />
                </div>
              ))}
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-300">
              {pendingCustomTemplate
                ? `${editingCustomId ? "Ready to save" : "Custom size ready to add"}: ${pendingCustomTemplate.label}`
                : selectedPart === "cone"
                  ? "Enter inner radius, outer radius, and sweep in degrees. Outer radius must be larger than inner radius."
                  : "Enter the part dimensions to add a custom size to the graph."}
            </div>
          </div>
        </div>

        {selectedTemplates.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3 dark:bg-card">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Scissors className="h-4 w-4 text-slate-500 dark:text-slate-200"/>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-100">
                  {selectedTemplates.length} size{selectedTemplates.length > 1 ? "s" : ""} selected
                </span>
                <Badge variant="outline" className="text-xs">
                  {totalArea.toFixed(2)} sq ft total
                </Badge>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-100">
                The graph stacks the selected sizes in the preview.
              </div>
            </div>

            <div className="flex gap-1.5 flex-wrap">
              {selectedTemplates.map((template) => (
                <span
                  key={template.id}
                  onClick={() => {
                    if (template.isCustom) {
                      removeCustomTemplate(template.id);
                    } else {
                      handleToggle(template.id);
                    }
                  }}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono font-medium cursor-pointer border transition-colors hover:opacity-75 ${CAT_CARD[template.category]}`}
                >
                  {template.label}
                  <span className="ml-0.5 opacity-50">×</span>
                </span>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-1 pr-3 font-semibold text-slate-600 dark:text-slate-100">Dimensions</th>
                    <th className="text-right py-1 pr-3 font-semibold text-slate-600 dark:text-slate-100">Qty</th>
                    <th className="text-right py-1 font-semibold text-slate-600 dark:text-slate-100">Sq ft each</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedTemplates.map((template) => (
                    <tr key={template.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-1 pr-3 font-mono font-semibold text-slate-800 dark:text-slate-200">
                        <span className="inline-flex items-center gap-1.5">
                          {template.label}
                          {template.isCustom && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${CAT_BADGE.custom}`}>
                              custom
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="py-1 pr-3 text-right text-slate-600 dark:text-slate-100">{template.quantity}</td>
                      <td className="py-1 text-right text-slate-600 dark:text-slate-100">
                        {getTemplateAreaSqFt(template).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-100 dark:bg-slate-950">
                    <td colSpan={2} className="py-1 pr-3 font-semibold text-slate-700 dark:text-slate-100">Total</td>
                    <td className="py-1 text-right font-semibold text-slate-700 dark:text-slate-100">
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
