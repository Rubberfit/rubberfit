"use client"

import { Download, Star } from "lucide-react"

import { UpgradeModal } from "@/app/components/billing/UpgradeModal"
import { ConfirmationDialog } from "@/app/components/common/confirmation-dialog"
import { Button } from "@/app/components/ui/button"
import { Card } from "@/app/components/ui/card"
import { TooltipProvider } from "@/app/components/ui/tooltip"
import { PageHeader, PageShell, ViewToolbar } from "@/app/components/patterns"

import { CutHistoryStats } from "./_components/cut-history-stats"
import { CutHistoryTable } from "./_components/cut-history-table"
import { DateRangePicker } from "./_components/date-range-picker"
import { useCutHistory } from "./_components/use-cut-history"
import { UserSelect } from "./_components/user-select"

export default function CutHistoryPage() {
  const {
    cuts,
    displayedCuts,
    users,
    selectedUserId,
    setSelectedUserId,
    searchTerm,
    setSearchTerm,
    showFavoritesOnly,
    setShowFavoritesOnly,
    dateRange,
    setDateRange,
    loading,
    favCount,
    totalColSpan,
    deleteConfirm,
    setDeleteConfirm,
    showDropdown,
    canDelete,
    roleLoading,
    userId,
    pendingPdfIds,
    handleToggleFavorite,
    handleConfirmDelete,
    handleReopen,
    handleViewPdf,
    exportToCsv,
    isExporting,
    upsellOpen,
    setUpsellOpen,
  } = useCutHistory()

  return (
    <TooltipProvider>
      <PageShell variant="dense">
        <PageHeader
          crumbs={[{ label: "Operations", href: "/dashboard" }, { label: "Cut history" }]}
          title="Cut history"
          subtitle="Review cutting operations, audit waste, and regenerate PDFs."
          actions={
            <Button
              onClick={exportToCsv}
              variant="outline"
              size="sm"
              disabled={loading || isExporting}
            >
              <Download className="size-3.5" aria-hidden="true" />
              {isExporting ? "Exporting…" : "Export CSV"}
            </Button>
          }
        />

        <CutHistoryStats cuts={displayedCuts} />

        <ViewToolbar
          searchPlaceholder="Search by part type, size, or date…"
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          filters={
            <>
              <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
              {showDropdown && !roleLoading && (
                <UserSelect
                  users={users}
                  selectedUserId={selectedUserId ?? null}
                  currentUserId={userId}
                  onUserChange={setSelectedUserId}
                />
              )}
            </>
          }
          actions={
            <Button
              variant={showFavoritesOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setShowFavoritesOnly((v) => !v)}
              disabled={!showFavoritesOnly && favCount === 0}
            >
              <Star
                className="size-3.5"
                fill={showFavoritesOnly ? "currentColor" : "none"}
                strokeWidth={1.5}
                aria-hidden="true"
              />
              Favorites
              {favCount > 0 && (
                <span className="ml-0.5 font-mono text-xs tabular-nums opacity-70">
                  ({favCount})
                </span>
              )}
            </Button>
          }
        />

        <Card className="overflow-hidden p-0">
          <CutHistoryTable
            cuts={displayedCuts}
            loading={loading}
            totalColSpan={totalColSpan}
            canDelete={canDelete}
            pendingPdfIds={pendingPdfIds}
            onToggleFavorite={handleToggleFavorite}
            onDeleteRequest={(cutId) => setDeleteConfirm({ open: true, cutId })}
            onReopen={handleReopen}
            onViewPdf={handleViewPdf}
          />
        </Card>

        {!loading && (
          <p className="text-xs text-muted-foreground">
            Showing {displayedCuts.length} of {cuts.length} record
            {cuts.length === 1 ? "" : "s"}
            {showFavoritesOnly && " (favorites only)"}.
          </p>
        )}

        <ConfirmationDialog
          open={deleteConfirm.open}
          onOpenChange={(open) => setDeleteConfirm((s) => ({ ...s, open }))}
          onConfirm={handleConfirmDelete}
          title="Delete cut record?"
          description="This will permanently remove this cut record. This action cannot be undone."
          confirmText="Delete"
          variant="danger"
        />

        <UpgradeModal
          open={upsellOpen}
          onOpenChange={setUpsellOpen}
          pathLabel="/EXPORT LOCKED"
          headline="CSV export requires Pro"
          body="Upgrade to Pro to unlock cut-history exports, branded PDFs, and the full analytics dashboard suite."
          requiredTier="pro"
        />
      </PageShell>
    </TooltipProvider>
  )
}
