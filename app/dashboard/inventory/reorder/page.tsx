"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { type ReorderRuleWithDetails } from "@/src/infrastructure/models/supabase"
import type { MaterialType } from "@/src/entities/material-type"
import type { SupplierSnapshot } from "@/src/entities/supplier"
import { PageHeader, PageShell } from "@/app/components/patterns"
import { cn } from "@/app/lib/utils"

import { AnalyticsSection } from "./_components/reorder-analytics-section"
import { BulkActionBar } from "./_components/reorder-bulk-action-bar"
import { fetchReorderData } from "./_components/reorder-data-fetcher"
import { handleCreateBulkPO } from "./_components/reorder-po-handlers"
import { ReorderRuleSheet } from "./_components/reorder-rule-sheet"
import { type EditableRule } from "./_components/reorder-rules-table"
import { RulesSection } from "./_components/reorder-rules-section"
import { ReorderStatsHero } from "./_components/reorder-stats-hero"
import { SuggestionsSection } from "./_components/reorder-suggestions-section"
import type { ReorderSuggestion } from "./_components/reorder-suggestions"

/**
 * Reorder workbench — Phase 3 PR 3e.
 *
 * Restyle pass over the existing real-wired surface. The tab strip
 * (`Rules / Suggestions / Analytics`) is replaced with three
 * scroll-anchored sections — only three of them, so a sticky
 * sub-nav would be more chrome than payoff. The page reads top-to-
 * bottom: stats hero (with a `<InlineNotice intent="danger">`
 * banner when critical stock exists) → Rules section
 * (`<ViewToolbar>` + the rules table) → Suggestions (the existing
 * selectable table) → Analytics (3-card grid, hairline borders).
 *
 * When `selectedSuggestions.size > 0`, a sticky bulk action bar
 * pins to the viewport bottom: "{N} selected" + Clear + Create POs
 * in batch. The rule modal stays as-is for this PR (3f converts it
 * to a right `<Sheet>`).
 *
 * See `docs/superpowers/specs/2026-05-07-dashboard-refactor-roadmap.md` §3.
 */
export default function ReorderRulesPage() {
  const router = useRouter()
  const [reorderRules, setReorderRules] = useState<ReorderRuleWithDetails[]>([])
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([])
  const [suppliers, setSuppliers] = useState<SupplierSnapshot[]>([])
  const [suggestions, setSuggestions] = useState<ReorderSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [editingRules, setEditingRules] = useState<Record<string, EditableRule>>({})
  const [selectedMaterial, setSelectedMaterial] = useState<string>("all")
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false)
  const [selectedRule, setSelectedRule] = useState<ReorderRuleWithDetails | null>(null)
  const [creatingIndividualPOs, setCreatingIndividualPOs] = useState(false)
  const [creatingBulkPO, setCreatingBulkPO] = useState(false)
  const [creatingPOFor, setCreatingPOFor] = useState<string | null>(null)
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set())

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const data = await fetchReorderData()
      setReorderRules(data.reorderRules)
      setMaterialTypes(data.materialTypes)
      setSuppliers(data.suppliers)
      setSuggestions(data.suggestions)
    } catch (error) {
      console.error("Error fetching reorder data:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const filteredRules = useMemo(() => {
    if (selectedMaterial === "all") return reorderRules
    return reorderRules.filter((r) => r.material_type_id === selectedMaterial)
  }, [reorderRules, selectedMaterial])

  // PO handler callbacks. `reorderRules` was dropped in the
  // tier-2 follow-up — the action regenerates suggestions
  // server-side, so the browser no longer ships rules to the write
  // path. Display surfaces (stats, analytics) still use rules via
  // their own props.
  const poCallbacks = useMemo(
    () => ({
      fetchData,
      routerPush: (url: string) => router.push(url),
      suggestions,
      selectedSuggestions,
      setCreatingPOFor,
      setCreatingIndividualPOs,
      setCreatingBulkPO,
      setSelectedSuggestions,
    }),
    [fetchData, router, suggestions, selectedSuggestions]
  )

  const stats = useMemo(() => {
    const activeCount = reorderRules.filter((r) => r.active).length
    const autoCount = reorderRules.filter((r) => r.auto_reorder).length
    const criticalCount = suggestions.filter((s) => s.urgencyLevel === "critical").length
    const estOrderValue = suggestions.reduce((sum, s) => sum + s.estimatedCost, 0)
    const avgLeadTime =
      reorderRules.length > 0
        ? Math.round(
            reorderRules.reduce((sum, r) => sum + r.lead_time_days, 0) / reorderRules.length
          )
        : 0
    return {
      activeCount,
      autoCount,
      reorderCount: suggestions.length,
      criticalCount,
      estOrderValue,
      avgLeadTime,
    }
  }, [reorderRules, suggestions])

  const handleClearSelection = useCallback(() => {
    setSelectedSuggestions(new Set())
  }, [])

  const handleBulkPOClick = useCallback(() => {
    void handleCreateBulkPO(poCallbacks)
  }, [poCallbacks])

  return (
    <PageShell variant="dense">
      <PageHeader
        crumbs={[
          { label: "Operations", href: "/dashboard" },
          { label: "Inventory", href: "/dashboard/inventory" },
          { label: "Reorder" },
        ]}
        title="Auto-Reorder"
        subtitle="Automatic reorder rules, low-stock suggestions, and reorder-point analytics."
      />

      {/* `pb-24` reserves space for the sticky bulk action bar so
          the Analytics section's last card never gets covered. */}
      <div className={cn("space-y-12", selectedSuggestions.size > 0 && "pb-24")}>
        <ReorderStatsHero stats={stats} />

        <RulesSection
          loading={loading}
          materialTypes={materialTypes}
          selectedMaterial={selectedMaterial}
          onMaterialChange={setSelectedMaterial}
          filteredRules={filteredRules}
          editingRules={editingRules}
          setEditingRules={setEditingRules}
          setReorderRules={setReorderRules}
          onAddRule={() => {
            setSelectedRule(null)
            setIsRuleModalOpen(true)
          }}
        />

        <SuggestionsSection
          suggestions={suggestions}
          selectedSuggestions={selectedSuggestions}
          setSelectedSuggestions={setSelectedSuggestions}
          creatingPOFor={creatingPOFor}
          creatingIndividualPOs={creatingIndividualPOs}
          creatingBulkPO={creatingBulkPO}
          poCallbacks={poCallbacks}
        />

        <AnalyticsSection reorderRules={reorderRules} />
      </div>

      {selectedSuggestions.size > 0 && (
        <BulkActionBar
          count={selectedSuggestions.size}
          creatingBulkPO={creatingBulkPO}
          onClear={handleClearSelection}
          onCreateBulk={handleBulkPOClick}
        />
      )}

      <ReorderRuleSheet
        open={isRuleModalOpen}
        onOpenChange={setIsRuleModalOpen}
        rule={selectedRule}
        materialTypes={materialTypes}
        suppliers={suppliers}
        onSuccess={() => {
          void fetchData()
          setIsRuleModalOpen(false)
        }}
      />
    </PageShell>
  )
}
