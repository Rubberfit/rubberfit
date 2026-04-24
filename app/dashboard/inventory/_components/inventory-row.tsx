"use client"

import { Edit, MoreVertical, Recycle, ShieldCheck, Trash2 } from "lucide-react"

import type { Roll } from "@/src/infrastructure/models/supabase"
import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu"
import { TableCell, TableRow } from "@/app/components/ui/table"
import { cn } from "@/app/lib/utils"

/**
 * One row of the inventory table. Lifted out of `InventoryTable`
 * so the parent stays close to the ESLint `max-lines-per-function`
 * budget and so the row's own click/selection state is unambiguous.
 *
 * Row click opens the detail drawer. The kebab-button column is
 * not a link — clicks on the dropdown and its menu items stop
 * propagation so they never double-fire the row's open handler.
 */

export type InventoryRowAction =
  | { type: "edit"; roll: Roll }
  | { type: "deplete"; rollId: string }
  | { type: "delete"; rollId: string }

interface InventoryRowProps {
  roll: Roll
  isActive: boolean
  canManageRolls: boolean
  onOpen: (roll: Roll) => void
  onAction: (action: InventoryRowAction) => void
}

function statusVariant(
  status: string | null | undefined
): "default" | "secondary" | "outline" {
  if (status === "active") return "default"
  if (status === "reserved") return "secondary"
  return "outline"
}

function formatSqft(remainingLength: number, width: number): string {
  if (!Number.isFinite(remainingLength) || !Number.isFinite(width)) return "—"
  return `${((remainingLength * width) / 144).toFixed(1)} sqft`
}

export function InventoryRow({
  roll,
  isActive,
  canManageRolls,
  onOpen,
  onAction,
}: InventoryRowProps) {
  return (
    <TableRow
      data-active={isActive ? "" : undefined}
      className={cn(
        "cursor-pointer transition-colors",
        "data-[active]:bg-muted/50"
      )}
      onClick={() => onOpen(roll)}
    >
      <TableCell className="font-mono text-muted-foreground text-[11px] tabular-nums">
        {roll.part_number ?? "—"}
      </TableCell>
      <TableCell className="font-medium text-foreground">
        <div className="flex items-center gap-2">
          <span>{roll.material_type}</span>
          {roll.color && (
            <span className="text-muted-foreground text-xs">· {roll.color}</span>
          )}
          {roll.is_offcut && (
            <Badge
              variant="outline"
              className="gap-1 border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-foreground)] font-normal text-[10px] px-1.5"
            >
              <Recycle className="size-2.5" aria-hidden="true" />
              Offcut
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="font-mono text-muted-foreground text-xs">
        {roll.width}″ × {roll.length}″ × {roll.thickness}″
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className="text-foreground text-sm">{roll.remaining_length}″</span>
          <span className="text-muted-foreground text-[11px]">
            {formatSqft(roll.remaining_length, roll.width)}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {roll.location || "—"}
      </TableCell>
      <TableCell>
        <Badge variant={statusVariant(roll.status)} className="capitalize">
          {roll.status ?? "unknown"}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {roll.date_received ? new Date(roll.date_received).toLocaleDateString() : "—"}
      </TableCell>
      {canManageRolls && (
        <TableCell className="w-10 text-right" onClick={(e) => e.stopPropagation()}>
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
              <DropdownMenuItem onClick={() => onAction({ type: "edit", roll })}>
                <Edit className="size-3.5" aria-hidden="true" />
                Edit
              </DropdownMenuItem>
              {roll.status === "active" && (
                <DropdownMenuItem
                  onClick={() => onAction({ type: "deplete", rollId: roll.id })}
                >
                  <ShieldCheck className="size-3.5" aria-hidden="true" />
                  Mark depleted
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-danger-foreground focus:text-danger-foreground"
                onClick={() => onAction({ type: "delete", rollId: roll.id })}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      )}
    </TableRow>
  )
}
