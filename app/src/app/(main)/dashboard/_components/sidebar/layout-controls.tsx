"use client"

import { Settings } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { FontKey } from "@/lib/fonts/registry"
import type {
  ContentLayout,
  NavbarStyle,
  SidebarCollapsible,
  SidebarVariant,
} from "@/lib/preferences/layout-config"
import {
  applyContentLayout,
  applyFont,
  applyNavbarStyle,
  applySidebarCollapsible,
  applySidebarVariant,
} from "@/lib/preferences/layout-utils"
import { PREFERENCE_DEFAULTS } from "@/lib/preferences/preferences-config"
import { persistPreference } from "@/lib/preferences/preferences-storage"
import { type ThemeMode, type ThemePreset } from "@/lib/preferences/theme"
import { applyThemePreset } from "@/lib/preferences/theme-utils"
import { usePreferencesStore } from "@/stores/preferences/preferences-provider"
import { LayoutControlsOptions } from "./layout-controls-options"

export function LayoutControls() {
  const themeMode = usePreferencesStore((s) => s.themeMode)
  const resolvedThemeMode = usePreferencesStore((s) => s.resolvedThemeMode)
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode)
  const themePreset = usePreferencesStore((s) => s.themePreset)
  const setThemePreset = usePreferencesStore((s) => s.setThemePreset)
  const contentLayout = usePreferencesStore((s) => s.contentLayout)
  const setContentLayout = usePreferencesStore((s) => s.setContentLayout)
  const navbarStyle = usePreferencesStore((s) => s.navbarStyle)
  const setNavbarStyle = usePreferencesStore((s) => s.setNavbarStyle)
  const variant = usePreferencesStore((s) => s.sidebarVariant)
  const setSidebarVariant = usePreferencesStore((s) => s.setSidebarVariant)
  const collapsible = usePreferencesStore((s) => s.sidebarCollapsible)
  const setSidebarCollapsible = usePreferencesStore((s) => s.setSidebarCollapsible)
  const font = usePreferencesStore((s) => s.font)
  const setFont = usePreferencesStore((s) => s.setFont)

  const onThemePresetChange = async (preset: ThemePreset) => {
    applyThemePreset(preset)
    setThemePreset(preset)
    persistPreference("theme_preset", preset)
  }

  const onThemeModeChange = async (mode: ThemeMode | "") => {
    if (!mode) return
    setThemeMode(mode)
    persistPreference("theme_mode", mode)
  }

  const onContentLayoutChange = async (layout: ContentLayout | "") => {
    if (!layout) return
    applyContentLayout(layout)
    setContentLayout(layout)
    persistPreference("content_layout", layout)
  }

  const onNavbarStyleChange = async (style: NavbarStyle | "") => {
    if (!style) return
    applyNavbarStyle(style)
    setNavbarStyle(style)
    persistPreference("navbar_style", style)
  }

  const onSidebarStyleChange = async (value: SidebarVariant | "") => {
    if (!value) return
    setSidebarVariant(value)
    applySidebarVariant(value)
    persistPreference("sidebar_variant", value)
  }

  const onSidebarCollapseModeChange = async (value: SidebarCollapsible | "") => {
    if (!value) return
    setSidebarCollapsible(value)
    applySidebarCollapsible(value)
    persistPreference("sidebar_collapsible", value)
  }

  const onFontChange = async (value: FontKey | "") => {
    if (!value) return
    applyFont(value)
    setFont(value)
    persistPreference("font", value)
  }

  const handleRestore = () => {
    onThemePresetChange(PREFERENCE_DEFAULTS.theme_preset)
    onThemeModeChange(PREFERENCE_DEFAULTS.theme_mode)
    onContentLayoutChange(PREFERENCE_DEFAULTS.content_layout)
    onNavbarStyleChange(PREFERENCE_DEFAULTS.navbar_style)
    onSidebarStyleChange(PREFERENCE_DEFAULTS.sidebar_variant)
    onSidebarCollapseModeChange(PREFERENCE_DEFAULTS.sidebar_collapsible)
    onFontChange(PREFERENCE_DEFAULTS.font)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon">
          <Settings />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end">
        <div className="flex flex-col gap-5">
          <div className="space-y-1.5">
            <h4 className="font-medium text-sm leading-none">Preferences</h4>
            <p className="text-muted-foreground text-xs">
              Customize your dashboard layout preferences.
            </p>
            <p className="font-medium text-muted-foreground text-xs">
              *Preferences use cookies by default. You can switch between cookies, localStorage, or
              no storage in code.
            </p>
          </div>
          <LayoutControlsOptions
            themePreset={themePreset}
            themeMode={themeMode}
            resolvedThemeMode={resolvedThemeMode}
            contentLayout={contentLayout}
            navbarStyle={navbarStyle}
            variant={variant}
            collapsible={collapsible}
            font={font}
            onThemePresetChange={onThemePresetChange}
            onThemeModeChange={onThemeModeChange}
            onContentLayoutChange={onContentLayoutChange}
            onNavbarStyleChange={onNavbarStyleChange}
            onSidebarStyleChange={onSidebarStyleChange}
            onSidebarCollapseModeChange={onSidebarCollapseModeChange}
            onFontChange={onFontChange}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full"
            onClick={handleRestore}
          >
            Restore Defaults
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
