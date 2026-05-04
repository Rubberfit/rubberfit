"use client"

import { Database, Globe } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Input } from "@/app/components/ui/input"
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

interface GeneralSettingsCardsProps {
  settings: {
    companyName: string
    defaultCurrency: string
    timeZone: string
    dateFormat: string
    defaultStockAlert: string
    autoReorderEnabled: boolean
    lowStockThreshold: string
    defaultWasteThreshold: string
    optimizationAlgorithm: string
    showCutDiagram: boolean
  }
  onSettingChange: (key: string, value: string | number | boolean) => void
}

export function GeneralSettingsCards({ settings, onSettingChange }: GeneralSettingsCardsProps) {
  return (
    <>
      {/* General Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            General Settings
          </CardTitle>
          <CardDescription>Basic application preferences and regional settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name</Label>
              <Input
                id="companyName"
                value={settings.companyName}
                onChange={(e) => onSettingChange("companyName", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="defaultCurrency">Default Currency</Label>
              <Select
                value={settings.defaultCurrency}
                onValueChange={(value) => onSettingChange("defaultCurrency", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD - US Dollar</SelectItem>
                  <SelectItem value="EUR">EUR - Euro</SelectItem>
                  <SelectItem value="GBP">GBP - British Pound</SelectItem>
                  <SelectItem value="CAD">CAD - Canadian Dollar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="timeZone">Time Zone</Label>
              <Select
                value={settings.timeZone}
                onValueChange={(value) => onSettingChange("timeZone", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/New_York">Eastern Time</SelectItem>
                  <SelectItem value="America/Chicago">Central Time</SelectItem>
                  <SelectItem value="America/Denver">Mountain Time</SelectItem>
                  <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateFormat">Date Format</Label>
              <Select
                value={settings.dateFormat}
                onValueChange={(value) => onSettingChange("dateFormat", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MM/dd/yyyy">MM/dd/yyyy</SelectItem>
                  <SelectItem value="dd/MM/yyyy">dd/MM/yyyy</SelectItem>
                  <SelectItem value="yyyy-MM-dd">yyyy-MM-dd</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Inventory Settings
          </CardTitle>
          <CardDescription>
            Configure inventory management and stock alert preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="defaultStockAlert">Default Stock Alert Level (sq ft)</Label>
              <Input
                id="defaultStockAlert"
                type="number"
                value={settings.defaultStockAlert}
                onChange={(e) => onSettingChange("defaultStockAlert", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lowStockThreshold">Low Stock Threshold (sq ft)</Label>
              <Input
                id="lowStockThreshold"
                type="number"
                value={settings.lowStockThreshold}
                onChange={(e) => onSettingChange("lowStockThreshold", e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Auto-Reorder (Phase 2)</Label>
              <p className="text-sm text-muted-foreground">
                Automatically suggest reorders when stock is low
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={settings.autoReorderEnabled}
                onCheckedChange={(checked) => onSettingChange("autoReorderEnabled", checked)}
                disabled
              />
              <Badge variant="secondary">Coming Soon</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cutting Settings */}
      {/* <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Cutting Operations
          </CardTitle>
          <CardDescription>
            Configure cutting optimization and waste management settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="defaultWasteThreshold">High Waste Alert Threshold (%)</Label>
              <Input
                id="defaultWasteThreshold"
                type="number"
                value={settings.defaultWasteThreshold}
                onChange={(e) => onSettingChange("defaultWasteThreshold", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="optimizationAlgorithm">Optimization Algorithm</Label>
              <Select
                value={settings.optimizationAlgorithm}
                onValueChange={(value) => onSettingChange("optimizationAlgorithm", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="first-fit-decreasing">First Fit Decreasing</SelectItem>
                  <SelectItem value="best-fit">Best Fit</SelectItem>
                  <SelectItem value="next-fit">Next Fit</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Show Cut Diagram</Label>
              <p className="text-sm text-muted-foreground">
                Display visual cutting diagrams in the Cutting Engine
              </p>
            </div>
            <Switch
              checked={settings.showCutDiagram}
              onCheckedChange={(checked) => onSettingChange("showCutDiagram", checked)}
            />
          </div>
        </CardContent>
      </Card> */}
    </>
  )
}
