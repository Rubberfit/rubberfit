"use client"

import { useState, useEffect, useCallback } from "react"
import { rollService } from "@/src/infrastructure/services/rollService"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog"
import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import { Trash2, Edit } from "lucide-react"
import { toast } from "sonner"
import { RollFormDialog } from "./roll-form-dialog"
import type { Roll } from "@/src/infrastructure/models/database.types"

interface InventoryTableProps {
  onRefresh?: number
  searchQuery?: string
  canManageRolls?: boolean // ← add this
}

export function InventoryTable({
  onRefresh,
  searchQuery = "",
  canManageRolls = false, // ← default to false (deny by default)
}: InventoryTableProps) {
  const readOnly = !canManageRolls
  const [rolls, setRolls] = useState<Roll[]>([])
  const [loading, setLoading] = useState(true)
  const [editingRoll, setEditingRoll] = useState<Roll | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [depleteDialogOpen, setDepleteDialogOpen] = useState(false)
  const [rollToDeplete, setRollToDeplete] = useState<string | null>(null)

  const fetchRolls = useCallback(async (query: string = "") => {
    try {
      setLoading(true)
      const data = query ? await rollService.searchRolls(query) : await rollService.getAllRolls()
      setRolls(data || [])
    } catch (error: unknown) {
      console.error("Error fetching rolls:", error)
      const message = error instanceof Error ? error.message : undefined
      toast.error("Failed to load inventory", { description: message })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRolls(searchQuery)
  }, [fetchRolls, onRefresh, searchQuery])

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this roll?")) return
    try {
      await rollService.deleteRoll(id)
      toast.success("Roll deleted successfully")
      fetchRolls(searchQuery)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : undefined
      toast.error("Failed to delete roll", { description: message })
    }
  }

  const handleMarkDepleted = async (id: string) => {
    try {
      await rollService.markRollDepleted(id)
      toast.success("Roll marked as depleted")
      fetchRolls(searchQuery)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : undefined
      toast.error("Failed to update roll", { description: message })
    }
  }

  const handleEdit = (roll: Roll) => {
    setEditingRoll(roll)
    setEditDialogOpen(true)
  }

  const handleEditSuccess = () => {
    fetchRolls(searchQuery)
    setEditingRoll(null)
  }

  const openDepleteDialog = (rollId: string) => {
    setRollToDeplete(rollId)
    setDepleteDialogOpen(true)
  }

  const confirmDeplete = async () => {
    if (rollToDeplete) {
      await handleMarkDepleted(rollToDeplete)
      setDepleteDialogOpen(false)
      setRollToDeplete(null)
    }
  }

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading inventory...</div>
  }

  if (rolls.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {readOnly
          ? "No rolls in inventory."
          : "No rolls in inventory. Upload a CSV file to add rolls."}
      </div>
    )
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Material Type</TableHead>
              <TableHead>Dimensions (W×L×T)</TableHead>
              <TableHead>Remaining</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date Received</TableHead>
              {/* Only show Actions column header if user can manage */}
              {canManageRolls && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rolls.map((roll) => (
              <TableRow key={roll.id}>
                <TableCell className="font-medium">{roll.material_type}</TableCell>
                <TableCell>
                  {roll.width}" × {roll.length}" × {roll.thickness}"
                </TableCell>
                <TableCell>{roll.remaining_length}"</TableCell>
                <TableCell>{roll.location || "-"}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      roll.status === "active"
                        ? "default"
                        : roll.status === "reserved"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {roll.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {roll.date_received ? new Date(roll.date_received).toLocaleDateString() : "-"}
                </TableCell>

                {/* Actions cell — only renders for admin and manager */}
                {canManageRolls && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {roll.status === "active" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openDepleteDialog(roll.id)}
                        >
                          Mark Depleted
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(roll)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(roll.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Edit Dialog — only mounts if user can manage */}
      {canManageRolls && (
        <RollFormDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          roll={editingRoll}
          onSuccess={handleEditSuccess}
        />
      )}

      {/* Deplete Confirmation Dialog — only mounts if user can manage */}
      {canManageRolls && (
        <AlertDialog open={depleteDialogOpen} onOpenChange={setDepleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Mark Roll as Depleted</AlertDialogTitle>
              <AlertDialogDescription>
                Mark this roll as depleted? This indicates the roll is fully used.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDeplete}>Mark as Depleted</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  )
}
