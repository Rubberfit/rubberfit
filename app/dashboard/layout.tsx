import type { ReactNode } from "react"

import { cookies } from "next/headers"

import { getOrganizationPreferences } from "@/app/actions/organization-preferences"
import { getUserPreferences } from "@/app/actions/user-preferences"
import { OrganizationPreferencesProvider } from "@/app/dashboard/_components/organization-preferences-provider"
import { AppSidebar } from "@/app/dashboard/_components/sidebar/app-sidebar"
import { UserPreferencesProvider } from "@/app/dashboard/_components/user-preferences-provider"
import { ProtectedRoute } from "@/app/(auth)/auth/ProtectedRoute"
import { Separator } from "@/app/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/app/components/ui/sidebar"
import {
  SIDEBAR_COLLAPSIBLE_VALUES,
  SIDEBAR_VARIANT_VALUES,
} from "@/app/lib/preferences/layout-config"
import { cn } from "@/app/lib/utils"
import { getPreference } from "@/app/server/server-actions"
import { buildFallbackOrganizationPreferences } from "@/src/infrastructure/models/organization-preferences"
import { buildFallbackUserPreferences } from "@/src/infrastructure/models/user-preferences"

import { AccountSwitcherWrapper } from "./_components/sidebar/account-switcher-wrapper"
import { LayoutControls } from "./_components/sidebar/layout-controls"
import { SearchDialog } from "./_components/sidebar/search-dialog"
import { ThemeSwitcher } from "./_components/sidebar/theme-switcher"

export default async function Layout({ children }: Readonly<{ children: ReactNode }>) {
  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false"
  const [variant, collapsible, userPreferencesResult, organizationPreferencesResult] =
    await Promise.all([
      getPreference("sidebar_variant", SIDEBAR_VARIANT_VALUES, "inset"),
      getPreference("sidebar_collapsible", SIDEBAR_COLLAPSIBLE_VALUES, "icon"),
      // Pre-fetch user + org prefs once at the layout so every client
      // subtree under /dashboard can read both without re-hitting the
      // actions. Per the 2026-05-14 operator-seeds-prints ruling, user
      // prefs drive personal screen display and org prefs drive
      // shared/printed surfaces (PDFs, billing dates). `not_provisioned`
      // / `no_organization` fall back to canonical defaults so the
      // dashboard isn't blocked on a missing row.
      getUserPreferences(),
      getOrganizationPreferences(),
    ])
  const initialUserPreferences =
    "data" in userPreferencesResult ? userPreferencesResult.data : buildFallbackUserPreferences()
  const initialOrganizationPreferences =
    "data" in organizationPreferencesResult
      ? organizationPreferencesResult.data
      : buildFallbackOrganizationPreferences()

  return (
    <ProtectedRoute>
      <UserPreferencesProvider initialPreferences={initialUserPreferences}>
        <OrganizationPreferencesProvider initialPreferences={initialOrganizationPreferences}>
          <SidebarProvider defaultOpen={defaultOpen}>
            <AppSidebar variant={variant} collapsible={collapsible} />
            <SidebarInset
              className={cn(
                "[html[data-content-layout=centered]_&]:mx-auto! [html[data-content-layout=centered]_&]:max-w-screen-2xl!",
                // Adds right margin for inset sidebar in centered layout up to 113rem.
                // On wider screens with collapsed sidebar, removes margin and sets margin auto for alignment.
                "max-[113rem]:peer-data-[variant=inset]:mr-2! min-[101rem]:peer-data-[variant=inset]:peer-data-[state=collapsed]:mr-auto!"
              )}
            >
              <header
                className={cn(
                  "flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12",
                  // Handle sticky navbar style with conditional classes so blur, background, z-index, and rounded corners remain consistent across all SidebarVariant layouts.
                  "[html[data-navbar-style=sticky]_&]:sticky [html[data-navbar-style=sticky]_&]:top-0 [html[data-navbar-style=sticky]_&]:z-50 [html[data-navbar-style=sticky]_&]:overflow-hidden [html[data-navbar-style=sticky]_&]:rounded-t-[inherit] [html[data-navbar-style=sticky]_&]:bg-background/50 [html[data-navbar-style=sticky]_&]:backdrop-blur-md"
                )}
              >
                <div className="flex w-full items-center justify-between px-4 lg:px-6">
                  <div className="flex items-center gap-1 lg:gap-2">
                    <SidebarTrigger className="-ml-1" />
                    <Separator
                      orientation="vertical"
                      className="mx-2 data-[orientation=vertical]:h-4"
                    />
                    <SearchDialog />
                  </div>
                  <div className="flex items-center gap-2">
                    <LayoutControls />
                    <ThemeSwitcher />
                    <AccountSwitcherWrapper />
                  </div>
                </div>
              </header>
              <div className="h-full p-4 md:p-6">{children}</div>
            </SidebarInset>
          </SidebarProvider>
        </OrganizationPreferencesProvider>
      </UserPreferencesProvider>
    </ProtectedRoute>
  )
}
