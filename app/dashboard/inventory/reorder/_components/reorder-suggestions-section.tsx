"use client"

import { ReorderSuggestionsTable } from "./reorder-suggestions-table"
import type { ReorderSuggestion } from "./reorder-suggestions"

interface SuggestionsSectionProps {
  suggestions: ReorderSuggestion[]
  selectedSuggestions: Set<string>
  setSelectedSuggestions: (value: Set<string>) => void
  creatingPOFor: string | null
  creatingIndividualPOs: boolean
  creatingBulkPO: boolean
  poCallbacks: Parameters<typeof ReorderSuggestionsTable>[0]["poCallbacks"]
}

export function SuggestionsSection({
  suggestions,
  selectedSuggestions,
  setSelectedSuggestions,
  creatingPOFor,
  creatingIndividualPOs,
  creatingBulkPO,
  poCallbacks,
}: SuggestionsSectionProps) {
  return (
    <section id="suggestions" className="scroll-mt-24 space-y-4">
      <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
        Reorder suggestions
        {suggestions.length > 0 && (
          <span className="ml-2 align-middle font-mono text-sm font-normal text-muted-foreground">
            ({suggestions.length})
          </span>
        )}
      </h2>

      <ReorderSuggestionsTable
        suggestions={suggestions}
        selectedSuggestions={selectedSuggestions}
        setSelectedSuggestions={setSelectedSuggestions}
        creatingPOFor={creatingPOFor}
        creatingIndividualPOs={creatingIndividualPOs}
        creatingBulkPO={creatingBulkPO}
        poCallbacks={poCallbacks}
      />
    </section>
  )
}
