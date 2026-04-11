"use client"

import { Bell, Clock } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Badge } from "@/app/components/ui/badge"
import { getActivityIcon, getActivityColor, formatTimestamp } from "./notification-helpers"

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
          <Bell className="h-5 w-5" />
          Recent Activities
        </CardTitle>
        <CardDescription>Latest actions and events in the system</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {activities.length > 0 ? (
          activities.map((activity) => (
            <div
              key={activity.id}
              className="flex items-start gap-3 p-3 rounded-lg border bg-card/50"
            >
              <div className="flex-shrink-0">
                <Badge
                  variant={
                    getActivityColor(activity.type) as
                      | "default"
                      | "secondary"
                      | "destructive"
                      | "outline"
                  }
                >
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
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{formatTimestamp(activity.timestamp)}</span>
                  {activity.job_reference && <span>Job: {activity.job_reference}</span>}
                  {activity.waste_percentage !== undefined &&
                    activity.waste_percentage !== null && (
                      <span className={activity.waste_percentage > 10 ? "text-amber-600" : ""}>
                        Waste: {activity.waste_percentage.toFixed(1)}%
                      </span>
                    )}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-2" />
            <p>No recent activities</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
