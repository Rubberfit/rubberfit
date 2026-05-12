import { Package, AlertTriangle, Clock, CheckCircle } from "lucide-react"

export function getActivityIcon(type: string) {
  switch (type) {
    case "cut":
      return <Package className="h-4 w-4" />
    case "roll_added":
      return <CheckCircle className="h-4 w-4" />
    case "roll_depleted":
      return <AlertTriangle className="h-4 w-4" />
    default:
      return <Clock className="h-4 w-4" />
  }
}

export type ActivityBadgeVariant = "default" | "secondary" | "destructive" | "outline"

export function getActivityColor(type: string): ActivityBadgeVariant {
  switch (type) {
    case "cut":
      return "default"
    case "roll_added":
      return "secondary"
    case "roll_depleted":
      return "destructive"
    default:
      return "outline"
  }
}

export function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`
  return "Just now"
}

export interface Notification {
  id: string
  type: string
  title: string
  description: string
  material_type?: string
  current_value?: number
  threshold_value?: number
  is_read: boolean
  created_at: string
  updated_at?: string
}

export function getSeverity(notification: Notification) {
  if (notification.type !== "low_stock") return "default"
  const ratio = (notification.current_value || 0) / (notification.threshold_value || 1)
  return ratio < 0.5 ? "high" : "medium"
}
