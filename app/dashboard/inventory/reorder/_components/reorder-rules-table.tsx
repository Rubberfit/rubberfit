"use client"

import { Edit2, Save, X } from "lucide-react"
import { Badge } from "@/app/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table"
import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import { Switch } from "@/app/components/ui/switch"
import { Progress } from "@/app/components/ui/progress"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import { toast } from "sonner"
import type { ReorderRuleWithDetails } from "@/src/infrastructure/models/supabase"
import { reorderRules as reorderRulesSdk } from "@/src/infrastructure/api-client/rf/procurement"

export interface EditableRule {
  id: string
  reorderPoint: number
  reorderQuantity: number
  maxStockLevel: number | null
  leadTimeDays: number
  safetyStockDays: number
  autoReorder: boolean
}

interface ReorderRulesTableProps {
  loading: boolean
  filteredRules: ReorderRuleWithDetails[]
  editingRules: Record<string, EditableRule>
  setEditingRules: React.Dispatch<React.SetStateAction<Record<string, EditableRule>>>
  setReorderRules: React.Dispatch<React.SetStateAction<ReorderRuleWithDetails[]>>
}

function startEditingRule(
  rule: ReorderRuleWithDetails,
  editingRules: Record<string, EditableRule>,
  setEditingRules: React.Dispatch<React.SetStateAction<Record<string, EditableRule>>>
) {
  setEditingRules({
    ...editingRules,
    [rule.id]: {
      id: rule.id,
      reorderPoint: rule.reorder_point,
      reorderQuantity: rule.reorder_quantity,
      maxStockLevel: rule.max_stock_level ?? null,
      leadTimeDays: rule.lead_time_days,
      safetyStockDays: rule.safety_stock_days,
      autoReorder: rule.auto_reorder,
    },
  })
}

function cancelEditing(
  ruleId: string,
  editingRules: Record<string, EditableRule>,
  setEditingRules: React.Dispatch<React.SetStateAction<Record<string, EditableRule>>>
) {
  const newEditing = { ...editingRules }
  delete newEditing[ruleId]
  setEditingRules(newEditing)
}

async function saveRule(
  ruleId: string,
  editingRules: Record<string, EditableRule>,
  setEditingRules: React.Dispatch<React.SetStateAction<Record<string, EditableRule>>>,
  setReorderRules: React.Dispatch<React.SetStateAction<ReorderRuleWithDetails[]>>
) {
  const editedRule = editingRules[ruleId]
  if (!editedRule) return

  const maxStock = editedRule.maxStockLevel
  if (maxStock !== null && maxStock !== undefined) {
    if (maxStock < editedRule.reorderQuantity) {
      toast.error("Max stock level must be greater than or equal to reorder quantity")
      return
    }
    if (maxStock <= editedRule.reorderPoint) {
      toast.error("Max stock level must be greater than reorder point")
      return
    }
  }

  try {
    const response = await reorderRulesSdk.update(ruleId, {
      reorder_point: editedRule.reorderPoint,
      reorder_quantity: editedRule.reorderQuantity,
      max_stock_level: maxStock || undefined,
      lead_time_days: editedRule.leadTimeDays,
      safety_stock_days: editedRule.safetyStockDays,
      auto_reorder: editedRule.autoReorder,
    })

    if (!response) throw new Error("Failed to update reorder rule")

    setReorderRules((rules) =>
      rules.map((r) =>
        r.id === ruleId
          ? {
              ...r,
              reorder_point: editedRule.reorderPoint,
              reorder_quantity: editedRule.reorderQuantity,
              max_stock_level: editedRule.maxStockLevel ?? undefined,
              lead_time_days: editedRule.leadTimeDays,
              safety_stock_days: editedRule.safetyStockDays,
              auto_reorder: editedRule.autoReorder,
            }
          : r
      )
    )

    cancelEditing(ruleId, editingRules, setEditingRules)
  } catch (error) {
    const err = error as Record<string, unknown>
    console.error("Error saving rule:", {
      message: err?.message,
      code: err?.code,
      details: err?.details,
    })
    toast.error("Failed to save rule", {
      description: error instanceof Error ? error.message : "An unexpected error occurred",
    })
  }
}

export function ReorderRulesTable({
  loading,
  filteredRules,
  editingRules,
  setEditingRules,
  setReorderRules,
}: ReorderRulesTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reorder Rules Configuration</CardTitle>
        <CardDescription>Set min/max stock levels and reorder parameters</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead>Current Stock</TableHead>
                <TableHead>Reorder Point</TableHead>
                <TableHead>Reorder Qty</TableHead>
                <TableHead>Max Stock</TableHead>
                <TableHead>Lead Time</TableHead>
                <TableHead>Safety Stock</TableHead>
                <TableHead>Auto-Reorder</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8">
                    Loading reorder rules...
                  </TableCell>
                </TableRow>
              ) : filteredRules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8">
                    No reorder rules configured
                  </TableCell>
                </TableRow>
              ) : (
                filteredRules.map((rule) => (
                  <RulesTableRow
                    key={rule.id}
                    rule={rule}
                    editingRules={editingRules}
                    setEditingRules={setEditingRules}
                    setReorderRules={setReorderRules}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

function RulesTableRow({
  rule,
  editingRules,
  setEditingRules,
  setReorderRules,
}: {
  rule: ReorderRuleWithDetails
  editingRules: Record<string, EditableRule>
  setEditingRules: React.Dispatch<React.SetStateAction<Record<string, EditableRule>>>
  setReorderRules: React.Dispatch<React.SetStateAction<ReorderRuleWithDetails[]>>
}) {
  const isEditing = !!editingRules[rule.id]
  const editedRule = editingRules[rule.id]
  const currentStock = rule.current_stock || 0
  const maxStock = rule.max_stock_level || 1000

  const updateField = (field: keyof EditableRule, value: number | boolean | null) => {
    setEditingRules({
      ...editingRules,
      [rule.id]: { ...editedRule, [field]: value },
    })
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{rule.material_type?.name || "Unknown"}</TableCell>
      <TableCell>
        <div className="space-y-1">
          <span className="font-mono">{currentStock.toFixed(0)} sq ft</span>
          <Progress value={(currentStock / maxStock) * 100} className="h-2" />
        </div>
      </TableCell>
      <RuleEditableCell
        isEditing={isEditing}
        value={editedRule?.reorderPoint}
        displayValue={`${rule.reorder_point} sq ft`}
        onChange={(v) => updateField("reorderPoint", v)}
        className="w-24"
      />
      <RuleEditableCell
        isEditing={isEditing}
        value={editedRule?.reorderQuantity}
        displayValue={`${rule.reorder_quantity} sq ft`}
        onChange={(v) => updateField("reorderQuantity", v)}
        className="w-24"
      />
      <RuleEditableCell
        isEditing={isEditing}
        value={editedRule?.maxStockLevel ?? ""}
        displayValue={`${rule.max_stock_level || "\u2014"} sq ft`}
        onChange={(v) => updateField("maxStockLevel", v === 0 ? null : v)}
        placeholder="Optional"
        className="w-24"
        nullable
      />
      <RuleEditableCell
        isEditing={isEditing}
        value={editedRule?.leadTimeDays}
        displayValue={<Badge variant="outline">{rule.lead_time_days} days</Badge>}
        onChange={(v) => updateField("leadTimeDays", v)}
        className="w-20"
      />
      <RuleEditableCell
        isEditing={isEditing}
        value={editedRule?.safetyStockDays}
        displayValue={`${rule.safety_stock_days} days`}
        onChange={(v) => updateField("safetyStockDays", v)}
        className="w-20"
      />
      <TableCell>
        <RuleAutoReorderToggle
          isEditing={isEditing}
          editedValue={editedRule?.autoReorder}
          ruleValue={rule.auto_reorder}
          onEditChange={(checked) => updateField("autoReorder", checked)}
          rule={rule}
          setReorderRules={setReorderRules}
        />
      </TableCell>
      <TableCell>
        {currentStock <= rule.reorder_point ? (
          <Badge variant="destructive">Reorder</Badge>
        ) : (
          <Badge variant="default">OK</Badge>
        )}
      </TableCell>
      <TableCell>
        {isEditing ? (
          <div className="flex gap-1">
            <Button
              className="min-h-[44px] min-w-[44px]"
              variant="ghost"
              onClick={() => saveRule(rule.id, editingRules, setEditingRules, setReorderRules)}
            >
              <Save className="h-4 w-4" />
            </Button>
            <Button
              className="min-h-[44px] min-w-[44px]"
              variant="ghost"
              onClick={() => cancelEditing(rule.id, editingRules, setEditingRules)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button
            className="min-h-[44px] min-w-[44px]"
            variant="ghost"
            onClick={() => startEditingRule(rule, editingRules, setEditingRules)}
          >
            <Edit2 className="h-4 w-4" />
          </Button>
        )}
      </TableCell>
    </TableRow>
  )
}

function RuleEditableCell({
  isEditing,
  value,
  displayValue,
  onChange,
  placeholder,
  className,
  nullable,
}: {
  isEditing: boolean
  value: number | string | undefined
  displayValue: React.ReactNode
  onChange: (value: number) => void
  placeholder?: string
  className?: string
  nullable?: boolean
}) {
  return (
    <TableCell>
      {isEditing ? (
        <Input
          type="number"
          value={value ?? ""}
          onChange={(e) =>
            onChange(nullable && !e.target.value ? 0 : parseInt(e.target.value) || 0)
          }
          placeholder={placeholder}
          className={className}
        />
      ) : (
        <span className="font-mono">{displayValue}</span>
      )}
    </TableCell>
  )
}

function RuleAutoReorderToggle({
  isEditing,
  editedValue,
  ruleValue,
  onEditChange,
  rule,
  setReorderRules,
}: {
  isEditing: boolean
  editedValue: boolean | undefined
  ruleValue: boolean
  onEditChange: (checked: boolean) => void
  rule: ReorderRuleWithDetails
  setReorderRules: React.Dispatch<React.SetStateAction<ReorderRuleWithDetails[]>>
}) {
  if (isEditing) {
    return <Switch checked={editedValue} onCheckedChange={onEditChange} />
  }

  return (
    <Switch
      checked={ruleValue}
      onCheckedChange={async (checked) => {
        try {
          const response = await reorderRulesSdk.update(rule.id, {
            auto_reorder: checked,
          })
          if (!response) throw new Error("Failed to update")
          setReorderRules((rules) =>
            rules.map((r) => (r.id === rule.id ? { ...r, auto_reorder: checked } : r))
          )
        } catch (error) {
          console.error(
            "Error toggling auto-reorder:",
            error instanceof Error ? error.message : error
          )
          toast.error("Failed to toggle auto-reorder")
        }
      }}
    />
  )
}
