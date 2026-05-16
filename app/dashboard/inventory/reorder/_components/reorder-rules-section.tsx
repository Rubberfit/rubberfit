"use client"

import { Plus } from "lucide-react"

import { type ReorderRuleWithDetails } from "@/src/infrastructure/models/supabase"
import type { MaterialType } from "@/src/entities/material-type"
import { Button } from "@/app/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select"
import { ViewToolbar } from "@/app/components/patterns"

import { ReorderRulesTable, type EditableRule } from "./reorder-rules-table"

interface RulesSectionProps {
  loading: boolean
  materialTypes: MaterialType[]
  selectedMaterial: string
  onMaterialChange: (value: string) => void
  filteredRules: ReorderRuleWithDetails[]
  editingRules: Record<string, EditableRule>
  setEditingRules: React.Dispatch<React.SetStateAction<Record<string, EditableRule>>>
  setReorderRules: React.Dispatch<React.SetStateAction<ReorderRuleWithDetails[]>>
  onAddRule: () => void
}

export function RulesSection({
  loading,
  materialTypes,
  selectedMaterial,
  onMaterialChange,
  filteredRules,
  editingRules,
  setEditingRules,
  setReorderRules,
  onAddRule,
}: RulesSectionProps) {
  return (
    // `scroll-mt-24` adds margin so anchor scrolling doesn't tuck
    // the section's heading under the dashboard top bar.
    <section id="rules" className="scroll-mt-24 space-y-4">
      <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
        Reorder rules
      </h2>

      <ViewToolbar
        hideSearch
        filters={
          <Select value={selectedMaterial} onValueChange={onMaterialChange}>
            <SelectTrigger className="h-9 w-[220px] text-sm">
              <SelectValue placeholder="All materials" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All materials</SelectItem>
              {materialTypes.map((m) => (
                <SelectItem key={m.id.value} value={m.id.value}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        actions={
          <Button size="sm" onClick={onAddRule}>
            <Plus className="size-3.5" aria-hidden="true" />
            Add rule
          </Button>
        }
      />

      <ReorderRulesTable
        loading={loading}
        filteredRules={filteredRules}
        editingRules={editingRules}
        setEditingRules={setEditingRules}
        setReorderRules={setReorderRules}
      />
    </section>
  )
}
