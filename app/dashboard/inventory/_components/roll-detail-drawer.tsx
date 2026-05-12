"use client"

import { Sheet, SheetContent } from "@/app/components/ui/sheet"
import type { Roll } from "@/src/infrastructure/models/supabase"

import { RollDetailBody } from "./roll-detail-body"

interface RollDetailDrawerProps {
  roll: Roll | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit?: (roll: Roll) => void
  canManageRolls?: boolean
}

/**
 * Right-docked detail panel for a single roll. Slim parent —
 * owns only the `<Sheet>` shell and a `<RollDetailBody>` keyed
 * on `roll.id` so a roll swap re-mounts the body and reruns the
 * usage + offcuts fetch from a fresh `useState` initial state.
 *
 * Phase 3 PR 3b — extracted from the prior single-file drawer
 * to satisfy the `max-lines-per-function` budget and to
 * eliminate the prior `useEffect`-on-prop-swap reset path.
 */
export function RollDetailDrawer({
  roll,
  open,
  onOpenChange,
  onEdit,
  canManageRolls = false,
}: RollDetailDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:w-full sm:max-w-xl">
        {roll && (
          <RollDetailBody
            key={roll.id}
            roll={roll}
            onEdit={onEdit}
            canManageRolls={canManageRolls}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
