"use client"

import { Link2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  type MaterialSupplier,
  type MaterialSupplierWithDetails,
} from "@/src/infrastructure/models/supabase"
import { materialSuppliers as materialSuppliersSdk } from "@/src/infrastructure/api-client/rf/inventory"
import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"

import { MaterialSupplierLinkInline } from "./material-supplier-link-inline"

interface SupplierLinkedMaterialsProps {
  supplierName: string
  supplierId: string
  linkedMaterials: MaterialSupplierWithDetails[]
  loadingMaterials: boolean
  /** Currently editing link, or null when adding a new one. */
  editingLink: MaterialSupplier | null
  /** Whether the inline link form is visible. */
  showLinkForm: boolean
  onShowLinkForm: (link?: MaterialSupplier | null) => void
  onCancelLinkForm: () => void
  onLinkSaved: () => void
  onRefresh: (supplierId: string) => void
}

/**
 * Linked-materials section on the supplier form's Materials tab —
 * Phase 3 PR 3h. Replaces the previous "Link Material" button +
 * sub-modal flow with an inline form revealed below the list.
 * Avoids the Sheet-inside-Sheet UX of the original drawer pattern.
 */
export function SupplierLinkedMaterials({
  supplierName,
  supplierId,
  linkedMaterials,
  loadingMaterials,
  editingLink,
  showLinkForm,
  onShowLinkForm,
  onCancelLinkForm,
  onLinkSaved,
  onRefresh,
}: SupplierLinkedMaterialsProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="size-4" />
              Linked materials
            </CardTitle>
            <CardDescription>Materials supplied by {supplierName} with pricing.</CardDescription>
          </div>
          {!showLinkForm && (
            <Button type="button" size="sm" onClick={() => onShowLinkForm(null)}>
              <Plus className="size-3.5" />
              Link material
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showLinkForm && (
          <MaterialSupplierLinkInline
            materialSupplier={editingLink}
            defaultSupplierId={supplierId}
            onCancel={onCancelLinkForm}
            onSuccess={onLinkSaved}
          />
        )}

        {loadingMaterials ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Loading linked materials…
          </div>
        ) : linkedMaterials.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <p>No materials linked to this supplier yet.</p>
            {!showLinkForm && (
              <p className="mt-1">Click &quot;Link material&quot; to add pricing for a material.</p>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-lg border">
            {linkedMaterials.map((link) => (
              <li key={link.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {link.material_type?.name || "Unknown material"}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span className="font-mono tabular-nums">
                        ${link.cost_per_sqft?.toFixed(2)}/sqft
                      </span>
                      {link.lead_time_days != null && <span>· {link.lead_time_days} day lead</span>}
                      {link.minimum_order_sqft != null && (
                        <span>· min {link.minimum_order_sqft} sqft</span>
                      )}
                    </div>
                  </div>
                  {link.preferred_supplier && <Badge variant="secondary">Preferred</Badge>}
                  {!link.active && <Badge variant="outline">Inactive</Badge>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onShowLinkForm(link)}
                    disabled={showLinkForm}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Unlink material"
                    onClick={async () => {
                      try {
                        await materialSuppliersSdk.delete(link.id)
                        toast.success("Material unlinked")
                        onRefresh(supplierId)
                      } catch (_error) {
                        toast.error("Failed to unlink material")
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
