"use client"

import { Edit, Trash2 } from "lucide-react"

import { type MaterialType } from "@/src/infrastructure/models/supabase"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Button } from "@/app/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table"
import { Badge } from "@/app/components/ui/badge"

interface MaterialTypesTableProps {
  materialTypes: MaterialType[]
  loading: boolean
  onEdit: (materialType: MaterialType) => void
  onDelete: (materialType: MaterialType) => void
}

export function MaterialTypesTable({
  materialTypes,
  loading,
  onEdit,
  onDelete,
}: MaterialTypesTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Material Types</CardTitle>
        <CardDescription>Configure material properties, pricing, and stock alerts</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Default Cost</TableHead>
                <TableHead>Stock Alert</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    Loading material types...
                  </TableCell>
                </TableRow>
              ) : materialTypes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    No material types found. Add your first material type to get started.
                  </TableCell>
                </TableRow>
              ) : (
                materialTypes.map((materialType) => (
                  <TableRow key={materialType.id}>
                    <TableCell className="font-medium">{materialType.name}</TableCell>
                    <TableCell className="max-w-xs">
                      <div
                        className="truncate text-sm text-muted-foreground"
                        title={materialType.description ?? undefined}
                      >
                        {materialType.description || "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      {materialType.default_cost ? (
                        <Badge variant="outline">
                          ${materialType.default_cost.toFixed(2)}/sq ft
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {materialType.min_stock_alert ? (
                        <Badge variant="secondary">{materialType.min_stock_alert} sq ft</Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(materialType.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => onEdit(materialType)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => onDelete(materialType)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
