"use client"

import { Label } from "@/app/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/app/components/ui/toggle-group"
import type {
  ContentLayout,
  NavbarStyle,
  SidebarCollapsible,
  SidebarVariant,
} from "@/app/lib/preferences/layout-config"
import type { ThemeMode } from "@/app/lib/preferences/theme"

interface LayoutControlsOptionsProps {
  themeMode: ThemeMode
  contentLayout: ContentLayout
  navbarStyle: NavbarStyle
  variant: SidebarVariant
  collapsible: SidebarCollapsible
  onThemeModeChange: (mode: ThemeMode | "") => void
  onContentLayoutChange: (layout: ContentLayout | "") => void
  onNavbarStyleChange: (style: NavbarStyle | "") => void
  onSidebarStyleChange: (value: SidebarVariant | "") => void
  onSidebarCollapseModeChange: (value: SidebarCollapsible | "") => void
}

export function LayoutControlsOptions({
  themeMode,
  contentLayout,
  navbarStyle,
  variant,
  collapsible,
  onThemeModeChange,
  onContentLayoutChange,
  onNavbarStyleChange,
  onSidebarStyleChange,
  onSidebarCollapseModeChange,
}: LayoutControlsOptionsProps) {
  return (
    <div className="space-y-3 **:data-[slot=toggle-group]:w-full **:data-[slot=toggle-group-item]:flex-1 **:data-[slot=toggle-group-item]:text-xs">
      <div className="space-y-1">
        <Label id="theme-mode-label" className="font-medium text-xs">
          Theme Mode
        </Label>
        <ToggleGroup
          aria-labelledby="theme-mode-label"
          size="sm"
          variant="outline"
          type="single"
          value={themeMode}
          onValueChange={onThemeModeChange}
        >
          <ToggleGroupItem value="light" aria-label="Toggle light">
            Light
          </ToggleGroupItem>
          <ToggleGroupItem value="dark" aria-label="Toggle dark">
            Dark
          </ToggleGroupItem>
          <ToggleGroupItem value="system" aria-label="Toggle system">
            System
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="space-y-1">
        <Label id="page-layout-label" className="font-medium text-xs">
          Page Layout
        </Label>
        <ToggleGroup
          aria-labelledby="page-layout-label"
          size="sm"
          variant="outline"
          type="single"
          value={contentLayout}
          onValueChange={onContentLayoutChange}
        >
          <ToggleGroupItem value="centered" aria-label="Toggle centered">
            Centered
          </ToggleGroupItem>
          <ToggleGroupItem value="full-width" aria-label="Toggle full-width">
            Full Width
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="space-y-1">
        <Label id="navbar-behavior-label" className="font-medium text-xs">
          Navbar Behavior
        </Label>
        <ToggleGroup
          aria-labelledby="navbar-behavior-label"
          size="sm"
          variant="outline"
          type="single"
          value={navbarStyle}
          onValueChange={onNavbarStyleChange}
        >
          <ToggleGroupItem value="sticky" aria-label="Toggle sticky">
            Sticky
          </ToggleGroupItem>
          <ToggleGroupItem value="scroll" aria-label="Toggle scroll">
            Scroll
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="space-y-1">
        <Label id="sidebar-style-label" className="font-medium text-xs">
          Sidebar Style
        </Label>
        <ToggleGroup
          aria-labelledby="sidebar-style-label"
          size="sm"
          variant="outline"
          type="single"
          value={variant}
          onValueChange={onSidebarStyleChange}
        >
          <ToggleGroupItem value="inset" aria-label="Toggle inset">
            Inset
          </ToggleGroupItem>
          <ToggleGroupItem value="sidebar" aria-label="Toggle sidebar">
            Sidebar
          </ToggleGroupItem>
          <ToggleGroupItem value="floating" aria-label="Toggle floating">
            Floating
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="space-y-1">
        <Label id="sidebar-collapse-label" className="font-medium text-xs">
          Sidebar Collapse Mode
        </Label>
        <ToggleGroup
          aria-labelledby="sidebar-collapse-label"
          size="sm"
          variant="outline"
          type="single"
          value={collapsible}
          onValueChange={onSidebarCollapseModeChange}
        >
          <ToggleGroupItem value="icon" aria-label="Toggle icon">
            Icon
          </ToggleGroupItem>
          <ToggleGroupItem value="offcanvas" aria-label="Toggle offcanvas">
            OffCanvas
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  )
}
