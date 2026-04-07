"use client"

import { Building, Mail, Phone, MapPin, Globe, CreditCard, Star } from "lucide-react"

import type { Supplier } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

interface SupplierOverviewTabProps {
  supplier: Supplier
}

function renderRatingStars(rating: number | null | undefined) {
  if (!rating) return <span className="text-muted-foreground">Not rated</span>

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-5 w-5 ${
              star <= rating ? "fill-yellow-500 text-yellow-500" : "text-gray-300"
            }`}
          />
        ))}
      </div>
      <span className="text-sm text-muted-foreground">({rating}/5)</span>
    </div>
  )
}

export function SupplierOverviewTab({ supplier }: SupplierOverviewTabProps) {
  return (
    <div className="space-y-6">
      {/* Contact Information */}
      <Card>
        <CardHeader>
          <CardTitle>Contact Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {supplier.contact_person && (
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Building className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Contact Person</p>
                <p className="font-medium">{supplier.contact_person}</p>
              </div>
            </div>
          )}

          {supplier.email && (
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <a
                  href={`mailto:${supplier.email}`}
                  className="font-medium text-blue-600 hover:underline"
                >
                  {supplier.email}
                </a>
              </div>
            </div>
          )}

          {supplier.phone && (
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Phone className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Phone</p>
                <a
                  href={`tel:${supplier.phone}`}
                  className="font-medium text-blue-600 hover:underline"
                >
                  {supplier.phone}
                </a>
              </div>
            </div>
          )}

          {supplier.website && (
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Globe className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Website</p>
                <a
                  href={supplier.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-600 hover:underline"
                >
                  {supplier.website}
                </a>
              </div>
            </div>
          )}

          {supplier.tax_id && (
            <>
              <Separator />
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tax ID / EIN</p>
                  <p className="font-medium">{supplier.tax_id}</p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Location & Tax */}
      <Card>
        <CardHeader>
          <CardTitle>Location & Tax</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <MapPin className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Address</p>
              <p className="font-medium">{supplier.address || "\u2014"}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">City</p>
              <p className="font-medium">{supplier.city || "\u2014"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">State</p>
              <p className="font-medium">{supplier.state || "\u2014"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">ZIP Code</p>
              <p className="font-medium">{supplier.zip_code || "\u2014"}</p>
            </div>
          </div>

          {supplier.country && (
            <div>
              <p className="text-sm text-muted-foreground">Country</p>
              <p className="font-medium">{supplier.country}</p>
            </div>
          )}

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Tax Status</p>
              <p className="font-medium">
                {supplier.tax_exempt ? (
                  <Badge variant="outline" className="text-green-600 border-green-600">
                    Tax Exempt
                  </Badge>
                ) : (
                  "Taxable"
                )}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Tax Rate</p>
              <p className="font-medium font-mono">
                {supplier.tax_exempt
                  ? "0%"
                  : supplier.tax_rate
                    ? `${(supplier.tax_rate * 100).toFixed(2)}% (override)`
                    : "Auto (Ziptax)"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Additional Information */}
      <Card>
        <CardHeader>
          <CardTitle>Additional Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-2">Supplier Rating</p>
            {renderRatingStars(supplier.rating)}
          </div>

          {supplier.notes && (
            <>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground mb-2">Internal Notes</p>
                <p className="text-sm whitespace-pre-wrap">{supplier.notes}</p>
              </div>
            </>
          )}

          <Separator />
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Created</p>
              <p className="font-medium">{new Date(supplier.created_at).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Last Updated</p>
              <p className="font-medium">{new Date(supplier.updated_at).toLocaleDateString()}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
