"use client"

import { useMemo } from "react"
import { Edit, MoreVertical, Recycle, ShieldCheck, Trash2 } from "lucide-react"

import type { Roll } from "@/src/infrastructure/models/supabase"
import { Button } from "@/app/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu"
import { StatusBadge, type StatusIntent } from "@/app/components/patterns"
import type { ColumnDef } from "@/app/components/patterns/data-table"
import { useOrganizationPreferences } from "@/app/dashboard/_components/organization-preferences-provider"
import {
  formatAreaSqft,
  formatDimensionsInches,
  formatLengthInches,
  type UnitDisplayPreferencesInput,
} from "@/src/application/preferences/user-unit-display"

interface UseInventoryColumnsArgs {
  canManageRolls: boolean
  onEdit: (roll: Roll) => void
  onDeplete: (rollId: string) => void
  onDelete: (rollId: string) => void
}

function formatRemainingArea(
  remainingLength: number,
  width: number,
  unitPreferences: UnitDisplayPreferencesInput
): string {
  if (!Number.isFinite(remainingLength) || !Number.isFinite(width)) return "—"
  return formatAreaSqft((remainingLength * width) / 144, unitPreferences, { precision: 1 })
}

function statusIntent(status: string | null | undefined): StatusIntent {
  if (status === "active") return "success"
  if (status === "reserved") return "info"
  return "neutral"
}

/**
 * Column registry for the inventory `<DataTable>`. Lifted out of
 * the table component so the function body stays under the
 * `max-lines-per-function` budget. Returns a stable, memoized
 * column array keyed on the action callbacks + permission flag.
 */
export function useInventoryColumns({
  canManageRolls,
  onEdit,
  onDeplete,
  onDelete,
}: UseInventoryColumnsArgs): ColumnDef<Roll>[] {
  const organizationPreferences = useOrganizationPreferences()
  return useMemo<ColumnDef<Roll>[]>(
    () => [
      {
        id: "part_number",
        header: "Part #",
        cell: (roll) => (
          <span className="font-mono text-muted-foreground text-[11px] tabular-nums">
            {roll.part_number ?? "—"}
          </span>
        ),
        sortFn: (roll) => roll.part_number ?? "",
        className: "w-28",
      },
      {
        id: "material",
        header: "Material",
        cell: (roll) => (
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">{roll.material_type}</span>
            {roll.color && <span className="text-muted-foreground text-xs">· {roll.color}</span>}
            {roll.is_offcut && (
              <span className="inline-flex items-center gap-1 rounded border border-[var(--warning-border)] bg-[var(--warning-bg)] px-1.5 py-0.5 text-[10px] font-normal text-[var(--warning-foreground)]">
                <Recycle className="size-2.5" aria-hidden="true" />
                Offcut
              </span>
            )}
          </div>
        ),
        sortFn: (roll) => roll.material_type ?? "",
      },
      {
        id: "dimensions",
        header: "Dimensions (W × L × T)",
        cell: (roll) => (
          <span className="font-mono text-muted-foreground text-xs tabular-nums">
            {formatDimensionsInches(
              [roll.width, roll.length, roll.thickness],
              organizationPreferences,
              { precision: 3 }
            )}
          </span>
        ),
      },
      {
        id: "remaining",
        header: "Remaining",
        cell: (roll) => (
          <div className="flex flex-col">
            <span className="text-foreground text-sm tabular-nums">
              {formatLengthInches(roll.remaining_length, organizationPreferences)}
            </span>
            <span className="text-muted-foreground text-[11px] tabular-nums">
              {formatRemainingArea(roll.remaining_length, roll.width, organizationPreferences)}
            </span>
          </div>
        ),
      },
      {
        id: "location",
        header: "Location",
        cell: (roll) => (
          <span className="text-muted-foreground text-sm">{roll.location || "—"}</span>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: (roll) => (
          <StatusBadge intent={statusIntent(roll.status)}>{roll.status ?? "unknown"}</StatusBadge>
        ),
        sortFn: (roll) => roll.status ?? "",
      },
      {
        id: "received",
        header: "Received",
        cell: (roll) => (
          <span className="text-muted-foreground text-sm">
            {roll.date_received ? new Date(roll.date_received).toLocaleDateString() : "—"}
          </span>
        ),
        // Null dates sort to the bottom regardless of direction —
        // returning 0 would place them at the year-1970 epoch and
        // bunch them above the older real dates on ascending sorts.
        sortFn: (roll) =>
          roll.date_received ? new Date(roll.date_received).getTime() : Number.MIN_SAFE_INTEGER,
        defaultSort: "desc",
      },
      ...(canManageRolls
        ? [
            {
              id: "actions",
              header: "",
              align: "right" as const,
              className: "w-10",
              cell: (roll: Roll) => (
                <div onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-foreground"
                      >
                        <MoreVertical className="size-4" aria-hidden="true" />
                        <span className="sr-only">Row actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(roll)}>
                        <Edit className="size-3.5" aria-hidden="true" />
                        Edit
                      </DropdownMenuItem>
                      {roll.status === "active" && (
                        <DropdownMenuItem onClick={() => onDeplete(roll.id)}>
                          <ShieldCheck className="size-3.5" aria-hidden="true" />
                          Mark depleted
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-danger-foreground focus:text-danger-foreground"
                        onClick={() => onDelete(roll.id)}
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ),
            },
          ]
        : []),
    ],
    [canManageRolls, onEdit, onDeplete, onDelete, organizationPreferences]
  )
}
