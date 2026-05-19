"use client"

import { format } from "date-fns"

import { type CutHistory } from "@/src/infrastructure/models/supabase"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table"
import { useOrganizationPreferences } from "@/app/dashboard/_components/organization-preferences-provider"
import {
  formatAreaSqft,
  formatDimensionsInches,
} from "@/src/application/preferences/user-unit-display"

interface RecentUsageTableProps {
  data: CutHistory[]
}

export function RecentUsageTable({ data }: RecentUsageTableProps) {
  const organizationPreferences = useOrganizationPreferences()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Material Usage</CardTitle>
        <CardDescription>Last 20 cutting operations</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Material</TableHead>
                <TableHead>Dimensions</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Material Used</TableHead>
                <TableHead>Fab Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((cut) => (
                <TableRow key={cut.id}>
                  <TableCell className="font-mono text-sm">
                    {format(new Date(cut.cut_date), "MMM d, HH:mm")}
                  </TableCell>
                  <TableCell>{cut.stock_label || "Unknown"}</TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {formatDimensionsInches(
                      [cut.cut_width, cut.cut_length],
                      organizationPreferences
                    )}
                  </TableCell>
                  <TableCell className="text-center">{cut.cut_amount}</TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {formatAreaSqft(cut.material_used_sqft, organizationPreferences, {
                      precision: 2,
                    })}
                  </TableCell>
                  <TableCell className="font-mono">{Math.round(cut.fab_score * 100)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
