"use client"

import { Settings } from "lucide-react"

import { Button } from "@/app/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/app/components/ui/popover"
import type {
  ContentLayout,
  NavbarStyle,
  SidebarCollapsible,
  SidebarVariant,
} from "@/app/lib/preferences/layout-config"
import {
  applyContentLayout,
  applyNavbarStyle,
  applySidebarCollapsible,
  applySidebarVariant,
} from "@/app/lib/preferences/layout-utils"
import { PREFERENCE_DEFAULTS } from "@/app/lib/preferences/preferences-config"
import { persistPreference } from "@/app/lib/preferences/preferences-storage"
import { type ThemeMode } from "@/app/lib/preferences/theme"
import { usePreferencesStore } from "@/app/stores/preferences/preferences-provider"
import { LayoutControlsOptions } from "./layout-controls-options"

export function LayoutControls() {
  const themeMode = usePreferencesStore((s) => s.themeMode)
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode)
  const contentLayout = usePreferencesStore((s) => s.contentLayout)
  const setContentLayout = usePreferencesStore((s) => s.setContentLayout)
  const navbarStyle = usePreferencesStore((s) => s.navbarStyle)
  const setNavbarStyle = usePreferencesStore((s) => s.setNavbarStyle)
  const variant = usePreferencesStore((s) => s.sidebarVariant)
  const setSidebarVariant = usePreferencesStore((s) => s.setSidebarVariant)
  const collapsible = usePreferencesStore((s) => s.sidebarCollapsible)
  const setSidebarCollapsible = usePreferencesStore((s) => s.setSidebarCollapsible)

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

  const handleRestore = () => {
    onThemeModeChange(PREFERENCE_DEFAULTS.theme_mode)
    onContentLayoutChange(PREFERENCE_DEFAULTS.content_layout)
    onNavbarStyleChange(PREFERENCE_DEFAULTS.navbar_style)
    onSidebarStyleChange(PREFERENCE_DEFAULTS.sidebar_variant)
    onSidebarCollapseModeChange(PREFERENCE_DEFAULTS.sidebar_collapsible)
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
          </div>
          <LayoutControlsOptions
            themeMode={themeMode}
            contentLayout={contentLayout}
            navbarStyle={navbarStyle}
            variant={variant}
            collapsible={collapsible}
            onThemeModeChange={onThemeModeChange}
            onContentLayoutChange={onContentLayoutChange}
            onNavbarStyleChange={onNavbarStyleChange}
            onSidebarStyleChange={onSidebarStyleChange}
            onSidebarCollapseModeChange={onSidebarCollapseModeChange}
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
