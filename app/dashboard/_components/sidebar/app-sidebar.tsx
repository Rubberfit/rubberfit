"use client"

import Link from "next/link"
import { useMemo } from "react"

import { CircleHelp, ClipboardList, Database, File, Search, Settings } from "lucide-react"
import { useShallow } from "zustand/react/shallow"

import { TierIndicatorClient } from "@/app/components/billing/TierIndicatorClient"
import { filterNavGroupsForRoles, getDefaultAuthorizedPath } from "@/app/lib/rbac"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/app/components/ui/sidebar"
import { APP_CONFIG } from "@/config/app-config"
import { useAuth } from "@/app/contexts/AuthContext"
import { sidebarItems } from "@/app/navigation/sidebar/sidebar-items"
import { usePreferencesStore } from "@/app/stores/preferences/preferences-provider"

import { NavMain } from "./nav-main"
import { NavUser } from "./nav-user"

const _data = {
  navSecondary: [
    {
      title: "Settings",
      url: "#",
      icon: Settings,
    },
    {
      title: "Get Help",
      url: "#",
      icon: CircleHelp,
    },
    {
      title: "Search",
      url: "#",
      icon: Search,
    },
  ],
  documents: [
    {
      name: "Data Library",
      url: "#",
      icon: Database,
    },
    {
      name: "Reports",
      url: "#",
      icon: ClipboardList,
    },
    {
      name: "Word Assistant",
      url: "#",
      icon: File,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAuth()
  const { sidebarVariant, sidebarCollapsible, isSynced } = usePreferencesStore(
    useShallow((s) => ({
      sidebarVariant: s.sidebarVariant,
      sidebarCollapsible: s.sidebarCollapsible,
      isSynced: s.isSynced,
    }))
  )

  const variant = isSynced ? sidebarVariant : props.variant
  const collapsible = isSynced ? sidebarCollapsible : props.collapsible
  const visibleItems = useMemo(
    () => filterNavGroupsForRoles(sidebarItems, user?.roles),
    [user?.roles]
  )
  const homeHref = getDefaultAuthorizedPath(user?.roles)
  return (
    <Sidebar {...props} variant={variant} collapsible={collapsible}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href={homeHref}>
                <img src="/rubberfit-mark.svg" alt="Rubberfit" className="size-5 shrink-0" />
                <span className="font-semibold text-base">{APP_CONFIG.name}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={visibleItems} />
        {/* <NavDocuments items={data.documents} /> */}
        {/* <NavSecondary items={data.navSecondary} className="mt-auto" /> */}
      </SidebarContent>
      <SidebarFooter>
        <TierIndicatorClient />
        {user && (
          <NavUser
            user={{
              name: user.name || user.email,
              email: user.email,
              avatar: user.avatar || "",
            }}
          />
        )}
      </SidebarFooter>
    </Sidebar>
  )
}
