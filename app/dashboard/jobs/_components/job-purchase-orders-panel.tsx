"use client"

import Link from "next/link"
import { ShoppingCart } from "lucide-react"

import { Badge } from "@/app/components/ui/badge"
import { Card } from "@/app/components/ui/card"
import type { PurchaseOrder } from "@/src/infrastructure/models/supabase"
import { cn } from "@/app/lib/utils"

/**
 * Purchase orders linked to this job (`purchase_orders.job_id`).
 * Mirrors the status tone language used on the PO list page so
 * operators see the same badges in both surfaces.
 */

interface JobPurchaseOrdersPanelProps {
  orders: PurchaseOrder[]
}

const STATUS_TONE: Record<PurchaseOrder["status"], string> = {
  draft: "border-border-subtle bg-muted text-muted-foreground",
  pending: "border-warning-border bg-warning-bg text-warning-foreground",
  approved: "border-info-border bg-info-bg text-info-foreground",
  ordered: "border-info-border bg-info-bg text-info-foreground",
  received: "border-success-border bg-success-bg text-success-foreground",
  cancelled: "border-border-subtle bg-muted text-muted-foreground",
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString()
}

export function JobPurchaseOrdersPanel({ orders }: JobPurchaseOrdersPanelProps) {
  return (
    <section className="space-y-3">
      <header>
        <h2 className="font-semibold text-foreground text-base tracking-tight">
          Purchase orders
        </h2>
        <p className="text-muted-foreground text-xs">
          {orders.length === 0
            ? "No POs linked to this job yet."
            : `${orders.length} PO${orders.length === 1 ? "" : "s"} raised to cover job material.`}
        </p>
      </header>
      {orders.length > 0 && (
        <Card className="gap-0 p-0 divide-y divide-border-subtle">
          {orders.map((po) => (
            <Link
              key={po.id}
              href={`/dashboard/inventory/purchase-orders?po=${po.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50"
            >
              <div className="flex items-center gap-3">
                <ShoppingCart
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-mono text-foreground/90 text-xs">{po.po_number}</p>
                  <p className="text-muted-foreground text-[11px]">
                    Ordered {formatDate(po.order_date)} · ${po.total_amount.toFixed(2)}
                  </p>
                </div>
              </div>
              <Badge
                variant="outline"
                className={cn("capitalize text-[10px]", STATUS_TONE[po.status])}
              >
                {po.status}
              </Badge>
            </Link>
          ))}
        </Card>
      )}
    </section>
  )
}
