"use client"

import { Plus, Trash2, Link2 } from "lucide-react"

import {
  type MaterialSupplierWithDetails,
  type MaterialSupplier,
} from "@/src/infrastructure/models/database.types"
import { supplierService } from "@/src/infrastructure/services/supplierService"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Button } from "@/app/components/ui/button"
import { Badge } from "@/app/components/ui/badge"
import { toast } from "sonner"

interface SupplierLinkedMaterialsProps {
  supplierName: string
  linkedMaterials: MaterialSupplierWithDetails[]
  loadingMaterials: boolean
  supplierId: string
  onEditLink: (link: MaterialSupplier) => void
  onAddLink: () => void
  onRefresh: (supplierId: string) => void
}

export function SupplierLinkedMaterials({
  supplierName,
  linkedMaterials,
  loadingMaterials,
  supplierId,
  onEditLink,
  onAddLink,
  onRefresh,
}: SupplierLinkedMaterialsProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Linked Materials
            </CardTitle>
            <CardDescription>
              Materials supplied by {supplierName} with pricing details
            </CardDescription>
          </div>
          <Button type="button" size="sm" onClick={onAddLink}>
            <Plus className="h-4 w-4 mr-2" />
            Link Material
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loadingMaterials ? (
          <div className="text-center py-8 text-muted-foreground">Loading linked materials...</div>
        ) : linkedMaterials.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No materials linked to this supplier yet.</p>
            <p className="text-sm mt-1">
              Click &quot;Link Material&quot; to add pricing for a material.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {linkedMaterials.map((link) => (
              <div
                key={link.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div>
                    <div className="font-medium">
                      {link.material_type?.name || "Unknown Material"}
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <span>${link.cost_per_sqft?.toFixed(2)}/sq ft</span>
                      {link.lead_time_days && <span>| {link.lead_time_days} day lead</span>}
                      {link.minimum_order_sqft && (
                        <span>| Min {link.minimum_order_sqft} sq ft</span>
                      )}
                    </div>
                  </div>
                  {link.preferred_supplier && <Badge variant="secondary">Preferred</Badge>}
                  {!link.active && <Badge variant="outline">Inactive</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onEditLink(link)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={async () => {
                      try {
                        await supplierService.unlinkMaterialFromSupplier(link.id)
                        toast.success("Material unlinked")
                        onRefresh(supplierId)
                      } catch (_error) {
                        toast.error("Failed to unlink material")
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
