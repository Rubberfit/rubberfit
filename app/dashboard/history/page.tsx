"use client"

import { Download, History, Search, Star } from "lucide-react"

import { Button } from "@/app/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Input } from "@/app/components/ui/input"
import { ConfirmationDialog } from "@/app/components/common/confirmation-dialog"
import { TooltipProvider } from "@/app/components/ui/tooltip"

import { CutHistoryStats } from "./_components/cut-history-stats"
import { CutHistoryTable } from "./_components/cut-history-table"
import { DateRangePicker } from "./_components/date-range-picker"
import { UserSelect } from "./_components/user-select"
import { useCutHistory } from "./_components/use-cut-history"

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
  } = useCutHistory()

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4 md:gap-6">
        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <History className="h-6 w-6" />
              Cut History
            </h1>
            <p className="text-sm text-muted-foreground">
              View and analyze all cutting operations with detailed waste tracking
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {showDropdown && !roleLoading && (
              <UserSelect
                users={users}
                selectedUserId={selectedUserId ?? null}
                currentUserId={userId}
                onUserChange={setSelectedUserId}
              />
            )}
            <Button onClick={exportToCsv} variant="outline" size="sm" disabled={loading}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Stats */}
        <CutHistoryStats cuts={displayedCuts} />

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by part type, size, or date…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
            <div>
              <CardTitle>Cut Records</CardTitle>
              <CardDescription>
                {displayedCuts.length} of {cuts.length} records shown
                {showFavoritesOnly && " (favorites)"}
              </CardDescription>
            </div>
            <Button
              variant={showFavoritesOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setShowFavoritesOnly((v) => !v)}
              className="shrink-0 gap-1.5"
              disabled={!showFavoritesOnly && favCount === 0}
            >
              <Star
                className="h-3.5 w-3.5"
                fill={showFavoritesOnly ? "currentColor" : "none"}
                strokeWidth={1.5}
              />
              Favorites
              {favCount > 0 && <span className="ml-0.5 text-xs opacity-70">({favCount})</span>}
            </Button>
          </CardHeader>

          <CardContent className="p-0">
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
          </CardContent>
        </Card>

        {/* Delete confirmation */}
        <ConfirmationDialog
          open={deleteConfirm.open}
          onOpenChange={(open) => setDeleteConfirm((s) => ({ ...s, open }))}
          onConfirm={handleConfirmDelete}
          title="Delete Cut Record?"
          description="This will permanently remove this cut record. This action cannot be undone."
          confirmText="Delete"
          variant="danger"
        />
      </div>
    </TooltipProvider>
  )
}
