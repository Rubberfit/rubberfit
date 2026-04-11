"use client"

import { Bell, Shield } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Label } from "@/app/components/ui/label"
import { Switch } from "@/app/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select"
import { Badge } from "@/app/components/ui/badge"

interface SystemSettingsCardsProps {
  settings: {
    emailNotifications: boolean
    lowStockAlerts: boolean
    highWasteAlerts: boolean
    systemUpdates: boolean
    autoBackup: boolean
    backupFrequency: string
    dataRetention: string
  }
  onSettingChange: (key: string, value: string | number | boolean) => void
}

export function SystemSettingsCards({ settings, onSettingChange }: SystemSettingsCardsProps) {
  return (
    <>
      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </CardTitle>
          <CardDescription>Manage notification preferences and alert settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Email Notifications (Phase 2)</Label>
                <p className="text-sm text-muted-foreground">Receive notifications via email</p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={settings.emailNotifications}
                  onCheckedChange={(checked) => onSettingChange("emailNotifications", checked)}
                  disabled
                />
                <Badge variant="secondary">Coming Soon</Badge>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Low Stock Alerts</Label>
                <p className="text-sm text-muted-foreground">Alert when inventory levels are low</p>
              </div>
              <Switch
                checked={settings.lowStockAlerts}
                onCheckedChange={(checked) => onSettingChange("lowStockAlerts", checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>High Waste Alerts</Label>
                <p className="text-sm text-muted-foreground">
                  Alert when waste levels exceed threshold
                </p>
              </div>
              <Switch
                checked={settings.highWasteAlerts}
                onCheckedChange={(checked) => onSettingChange("highWasteAlerts", checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>System Updates (Phase 2)</Label>
                <p className="text-sm text-muted-foreground">
                  Notifications about system updates and maintenance
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={settings.systemUpdates}
                  onCheckedChange={(checked) => onSettingChange("systemUpdates", checked)}
                  disabled
                />
                <Badge variant="secondary">Coming Soon</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* System Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            System & Data
          </CardTitle>
          <CardDescription>Data management, backup, and security settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="backupFrequency">Backup Frequency (Phase 2)</Label>
              <Select
                value={settings.backupFrequency}
                onValueChange={(value) => onSettingChange("backupFrequency", value)}
                disabled
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dataRetention">Data Retention Period</Label>
              <Select
                value={settings.dataRetention}
                onValueChange={(value) => onSettingChange("dataRetention", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1-year">1 Year</SelectItem>
                  <SelectItem value="2-years">2 Years</SelectItem>
                  <SelectItem value="5-years">5 Years</SelectItem>
                  <SelectItem value="forever">Keep Forever</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Auto Backup (Phase 2)</Label>
              <p className="text-sm text-muted-foreground">
                Automatically backup data at regular intervals
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={settings.autoBackup}
                onCheckedChange={(checked) => onSettingChange("autoBackup", checked)}
                disabled
              />
              <Badge variant="secondary">Coming Soon</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Application Info */}
      <Card>
        <CardHeader>
          <CardTitle>Application Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Version:</span>
            <span className="font-mono">1.0.0-beta</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Database:</span>
            <span>Supabase PostgreSQL</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Last Updated:</span>
            <span>{new Date().toLocaleDateString()}</span>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
