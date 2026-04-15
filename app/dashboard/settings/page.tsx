"use client"

import { useState } from "react"

import { Button } from "@/app/components/ui/button"
import { toast } from "sonner"

import { GeneralSettingsCards } from "./_components/general-settings-cards"
import { SystemSettingsCards } from "./_components/system-settings-cards"

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    // General Settings
    companyName: "Arc & Anchor",
    defaultCurrency: "USD",
    timeZone: "America/Chicago",
    dateFormat: "MM/dd/yyyy",

    // Inventory Settings
    defaultStockAlert: "100",
    autoReorderEnabled: false,
    lowStockThreshold: "50",

    // Cutting Settings
    defaultWasteThreshold: "20",
    optimizationAlgorithm: "first-fit-decreasing",
    showCutDiagram: true,

    // Notification Settings
    emailNotifications: true,
    lowStockAlerts: true,
    highWasteAlerts: true,
    systemUpdates: false,

    // System Settings
    autoBackup: true,
    backupFrequency: "daily",
    dataRetention: "2-years",
  })

  const handleSettingChange = (key: string, value: string | number | boolean) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }))
  }

  const saveSettings = () => {
    // In real implementation, this would save to database/backend
    toast.success("Settings saved successfully")
  }

  const resetToDefaults = () => {
    if (confirm("Are you sure you want to reset all settings to their default values?")) {
      // Reset to default values
      toast.success("Settings reset to default values")
    }
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">
            Configure system preferences and operational parameters
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetToDefaults}>
            Reset to Defaults
          </Button>
          <Button onClick={saveSettings}>Save Changes</Button>
        </div>
      </div>

      <GeneralSettingsCards settings={settings} onSettingChange={handleSettingChange} />

      <SystemSettingsCards settings={settings} onSettingChange={handleSettingChange} />
    </div>
  )
}
