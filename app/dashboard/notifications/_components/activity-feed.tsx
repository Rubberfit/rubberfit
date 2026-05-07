"use client"

import { Bell, Clock } from "lucide-react"

import { Badge } from "@/app/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import { cn } from "@/app/lib/utils"

import { formatTimestamp, getActivityColor, getActivityIcon } from "./notification-helpers"

interface Activity {
  id: string
  type: "cut" | "roll_added" | "roll_depleted"
  description: string
  timestamp: string
  job_reference?: string
  material_type?: string
  waste_percentage?: number
}

interface ActivityFeedProps {
  activities: Activity[]
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="size-4" aria-hidden="true" />
          Recent activity
        </CardTitle>
        <CardDescription>Latest actions and events in the system.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {activities.length > 0 ? (
          activities.map((activity) => (
            <div
              key={activity.id}
              className="flex items-start gap-3 rounded-lg border bg-card/50 p-3"
            >
              <div className="flex-shrink-0">
                <Badge variant={getActivityColor(activity.type)}>
                  {getActivityIcon(activity.type)}
                  {activity.type === "cut"
                    ? "Cut"
                    : activity.type === "roll_added"
                      ? "Added"
                      : "Depleted"}
                </Badge>
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium">{activity.description}</p>
                <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                  <span>{formatTimestamp(activity.timestamp)}</span>
                  {activity.job_reference && <span>Job: {activity.job_reference}</span>}
                  {activity.waste_percentage != null && (
                    <span
                      className={cn(
                        "font-mono tabular-nums",
                        activity.waste_percentage > 10 && "text-[color:var(--warning)]"
                      )}
                    >
                      Waste: {activity.waste_percentage.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            <Clock className="mx-auto mb-2 size-12" aria-hidden="true" />
            <p>No recent activity.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
