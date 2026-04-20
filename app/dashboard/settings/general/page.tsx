"use client"

import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/app/components/ui/button"
import { PageHeader, PageShell } from "@/app/components/patterns"

import { GeneralSettingsCards } from "../_components/general-settings-cards"
import { SystemSettingsCards } from "../_components/system-settings-cards"

export default function GeneralSettingsPage() {
  const [settings, setSettings] = useState({
    companyName: "Arc & Anchor",
    defaultCurrency: "USD",
    timeZone: "America/Chicago",
    dateFormat: "MM/dd/yyyy",
    defaultStockAlert: "100",
    autoReorderEnabled: false,
    lowStockThreshold: "50",
    defaultWasteThreshold: "20",
    optimizationAlgorithm: "first-fit-decreasing",
    showCutDiagram: true,
    emailNotifications: true,
    lowStockAlerts: true,
    highWasteAlerts: true,
    systemUpdates: false,
    autoBackup: true,
    backupFrequency: "daily",
    dataRetention: "2-years",
  })

  const handleSettingChange = (key: string, value: string | number | boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  const saveSettings = () => {
    toast.success("Settings saved successfully")
  }

  const resetToDefaults = () => {
    if (confirm("Are you sure you want to reset all settings to their default values?")) {
      toast.success("Settings reset to default values")
    }
  }

  return (
    <PageShell variant="form">
      <PageHeader
        crumbs={[
          { label: "Settings", href: "/dashboard/settings" },
          { label: "General" },
        ]}
        title="General"
        subtitle="System preferences, inventory thresholds, and operational parameters."
        actions={
          <>
            <Button size="sm" variant="outline" onClick={resetToDefaults}>
              Reset to defaults
            </Button>
            <Button size="sm" onClick={saveSettings}>
              Save changes
            </Button>
          </>
        }
      />
      <GeneralSettingsCards settings={settings} onSettingChange={handleSettingChange} />
      <SystemSettingsCards settings={settings} onSettingChange={handleSettingChange} />
    </PageShell>
  )
}
