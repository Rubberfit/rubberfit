"use client"

import { Edit, Trash2, Star } from "lucide-react"

import { type Supplier } from "@/src/infrastructure/models/database.types"
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

interface SuppliersTableCardProps {
  suppliers: Supplier[]
  loading: boolean
  searchTerm: string
  filterPreferred: boolean
  filterActive: boolean
  onViewSupplier: (supplier: Supplier) => void
  onEditSupplier: (supplier: Supplier) => void
  onDeleteClick: (supplier: Supplier) => void
}

export function SuppliersTableCard({
  suppliers,
  loading,
  searchTerm,
  filterPreferred,
  filterActive,
  onViewSupplier,
  onEditSupplier,
  onDeleteClick,
}: SuppliersTableCardProps) {
  const renderRatingStars = (rating: number | null | undefined) => {
    if (!rating) return <span className="text-muted-foreground">—</span>

    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${
              star <= rating ? "fill-yellow-500 text-yellow-500" : "text-gray-300"
            }`}
          />
        ))}
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Supplier List</CardTitle>
        <CardDescription>
          {suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""} found
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    Loading suppliers...
                  </TableCell>
                </TableRow>
              ) : suppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    {searchTerm || filterPreferred || !filterActive
                      ? "No suppliers match your search criteria."
                      : "No suppliers found. Add your first supplier to get started."}
                  </TableCell>
                </TableRow>
              ) : (
                suppliers.map((supplier) => (
                  <TableRow
                    key={supplier.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => onViewSupplier(supplier)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="font-medium">{supplier.name}</div>
                          {supplier.preferred && (
                            <Badge variant="secondary" className="mt-1">
                              Preferred
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {supplier.contact_person || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {supplier.email ? (
                        <a
                          href={`mailto:${supplier.email}`}
                          className="text-blue-600 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {supplier.email}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {supplier.phone ? (
                        <a
                          href={`tel:${supplier.phone}`}
                          className="text-blue-600 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {supplier.phone}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{renderRatingStars(supplier.rating)}</TableCell>
                    <TableCell>
                      <Badge variant={supplier.active ? "default" : "secondary"}>
                        {supplier.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            onEditSupplier(supplier)
                          }}
                          className="min-h-[36px] min-w-[36px]"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            onDeleteClick(supplier)
                          }}
                          className="min-h-[36px] min-w-[36px] hover:bg-red-50 hover:text-red-600"
                        >
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
