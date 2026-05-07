"use client"

import { CheckCircle, Clock, Edit2, Package, Truck, XCircle } from "lucide-react"

import { Badge } from "@/app/components/ui/badge"

/**
 * PO status pill — extracted from `po-view-dialog.tsx` (Phase 3
 * PR 3c) so the view-sections + the new drawer + the table column
 * registry can all share the same status mapping without depending
 * on the dialog file (which gets deleted in this PR).
 */
const STATUS_CONFIG = {
  draft: { variant: "secondary" as const, icon: <Edit2 className="h-3 w-3" /> },
  pending: { variant: "warning" as const, icon: <Clock className="h-3 w-3" /> },
  approved: { variant: "default" as const, icon: <CheckCircle className="h-3 w-3" /> },
  ordered: { variant: "outline" as const, icon: <Truck className="h-3 w-3" /> },
  received: { variant: "success" as const, icon: <Package className="h-3 w-3" /> },
  cancelled: { variant: "destructive" as const, icon: <XCircle className="h-3 w-3" /> },
} as const

export function getStatusBadge(status: string) {
  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.draft
  return (
    <Badge variant={cfg.variant} className="gap-1">
      {cfg.icon}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  )
}
