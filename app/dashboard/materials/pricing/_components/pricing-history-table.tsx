"use client"

import { format } from "date-fns"
import { ArrowUpRight, ArrowDownRight } from "lucide-react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table"
import { Badge } from "@/app/components/ui/badge"
import type { PriceHistoryWithJoins } from "./pricing-types"

interface PricingHistoryTableProps {
  loading: boolean
  filteredPriceHistory: PriceHistoryWithJoins[]
}

export function PricingHistoryTable({ loading, filteredPriceHistory }: PricingHistoryTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Material</TableHead>
          <TableHead>Supplier</TableHead>
          <TableHead>Old Price</TableHead>
          <TableHead>New Price</TableHead>
          <TableHead>Change</TableHead>
          <TableHead>Reason</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          <TableRow>
            <TableCell colSpan={7} className="text-center py-8">
              Loading price history...
            </TableCell>
          </TableRow>
        ) : filteredPriceHistory.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="text-center py-8">
              No price history records for the selected period
            </TableCell>
          </TableRow>
        ) : (
          filteredPriceHistory.map((h) => <PriceHistoryRow key={h.id} record={h} />)
        )}
      </TableBody>
    </Table>
  )
}

// eslint-disable-next-line complexity
function PriceHistoryRow({ record }: { record: PriceHistoryWithJoins }) {
  let dateStr = ""
  try {
    const raw = record.effective_date || record.created_at
    dateStr = raw ? format(new Date(String(raw).replace(" ", "T")), "MMM dd, yyyy") : ""
  } catch (_error) {
    dateStr = record.effective_date || ""
  }

  const pct = record.price_change_percentage
  const isIncrease = pct != null && pct > 0
  const isDecrease = pct != null && pct < 0

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">{dateStr}</TableCell>
      <TableCell className="font-medium">
        {record.material_supplier?.material_type?.name || "Unknown"}
      </TableCell>
      <TableCell>{record.material_supplier?.supplier?.name || "Unknown"}</TableCell>
      <TableCell className="font-mono">
        {record.old_cost_per_sqft != null
          ? `$${Number(record.old_cost_per_sqft).toFixed(2)}`
          : "\u2014"}
      </TableCell>
      <TableCell className="font-mono font-semibold">
        {record.new_cost_per_sqft != null
          ? `$${Number(record.new_cost_per_sqft).toFixed(2)}`
          : "\u2014"}
      </TableCell>
      <TableCell>
        {pct != null ? (
          <div className="flex items-center gap-1">
            {isIncrease ? (
              <ArrowUpRight className="h-4 w-4 text-orange-600" />
            ) : isDecrease ? (
              <ArrowDownRight className="h-4 w-4 text-green-600" />
            ) : null}
            <span className={isIncrease ? "text-orange-600" : isDecrease ? "text-green-600" : ""}>
              {isIncrease ? "+" : ""}
              {Number(pct).toFixed(1)}%
            </span>
          </div>
        ) : (
          <Badge variant="secondary">Initial</Badge>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
        {record.change_reason || "\u2014"}
      </TableCell>
    </TableRow>
  )
}
