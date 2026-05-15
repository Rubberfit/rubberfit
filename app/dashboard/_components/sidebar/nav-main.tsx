"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState, useEffect } from "react"

import { ChevronRight, MailIcon, PlusCircleIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { rollService } from "@/src/infrastructure/services/rollService"
import { notificationCrudService } from "@/src/infrastructure/services/notificationCrudService"
import { useAuth } from "@/app/contexts/AuthContext"
import { isRestrictedCutter } from "@/app/lib/rbac"
import { globalEvents, EVENTS } from "@/app/lib/events"

import { Button } from "@/app/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/app/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/app/components/ui/sidebar"
import type { NavGroup, NavMainItem } from "@/app/navigation/sidebar/sidebar-items"
import { useRole } from "@/src/infrastructure/services/useRole"
import { QuickCreateDialog } from "./nav-main-submenu"

interface NavMainProps {
  readonly items: readonly NavGroup[]
}

const IsComingSoon = () => {
  const t = useTranslations("nav")
  return (
    <span className="ml-auto rounded-md bg-muted px-2 py-1 text-xs dark:text-muted-foreground">
      {t("chrome.comingSoon")}
    </span>
  )
}

const NavItemExpanded = ({
  item,
  isActive,
  isSubmenuOpen,
}: {
  item: NavMainItem
  isActive: (url: string, subItems?: NavMainItem["subItems"]) => boolean
  isSubmenuOpen: (subItems?: NavMainItem["subItems"]) => boolean
}) => {
  const t = useTranslations("nav")
  const title = t(item.titleKey)
  return (
    <Collapsible
      key={item.url}
      asChild
      defaultOpen={isSubmenuOpen(item.subItems)}
      className="group/collapsible"
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          {item.subItems ? (
            <SidebarMenuButton
              disabled={item.comingSoon}
              isActive={isActive(item.url, item.subItems)}
              tooltip={title}
            >
              {item.icon && <item.icon />}
              <span>{title}</span>
              {item.comingSoon && <IsComingSoon />}
              <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
            </SidebarMenuButton>
          ) : (
            <SidebarMenuButton
              asChild
              aria-disabled={item.comingSoon}
              isActive={isActive(item.url)}
              tooltip={title}
            >
              <Link href={item.url} target={item.newTab ? "_blank" : undefined}>
                {item.icon && <item.icon />}
                <span>{title}</span>
                {item.comingSoon && <IsComingSoon />}
              </Link>
            </SidebarMenuButton>
          )}
        </CollapsibleTrigger>
        {item.subItems && (
          <CollapsibleContent>
            <SidebarMenuSub>
              {item.subItems.map((subItem) => (
                <SidebarMenuSubItem key={subItem.url}>
                  <SidebarMenuSubButton
                    aria-disabled={subItem.comingSoon}
                    isActive={isActive(subItem.url)}
                    asChild
                  >
                    <Link href={subItem.url} target={subItem.newTab ? "_blank" : undefined}>
                      {subItem.icon && <subItem.icon />}
                      <span>{t(subItem.titleKey)}</span>
                      {subItem.comingSoon && <IsComingSoon />}
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              ))}
            </SidebarMenuSub>
          </CollapsibleContent>
        )}
      </SidebarMenuItem>
    </Collapsible>
  )
}

const NavItemCollapsed = ({
  item,
  isActive,
}: {
  item: NavMainItem
  isActive: (url: string, subItems?: NavMainItem["subItems"]) => boolean
}) => {
  const t = useTranslations("nav")
  const title = t(item.titleKey)
  return (
    <SidebarMenuItem key={item.url}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            disabled={item.comingSoon}
            tooltip={title}
            isActive={isActive(item.url, item.subItems)}
          >
            {item.icon && <item.icon />}
            <span>{title}</span>
            <ChevronRight />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-50 space-y-1" side="right" align="start">
          {item.subItems?.map((subItem) => (
            <DropdownMenuItem key={subItem.url} asChild>
              <SidebarMenuSubButton
                key={subItem.url}
                asChild
                className="focus-visible:ring-0"
                aria-disabled={subItem.comingSoon}
                isActive={isActive(subItem.url)}
              >
                <Link href={subItem.url} target={subItem.newTab ? "_blank" : undefined}>
                  {subItem.icon && <subItem.icon className="[&>svg]:text-sidebar-foreground" />}
                  <span>{t(subItem.titleKey)}</span>
                  {subItem.comingSoon && <IsComingSoon />}
                </Link>
              </SidebarMenuSubButton>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  )
}

export function NavMain({ items }: NavMainProps) {
  const path = usePathname()
  const router = useRouter()
  const { user } = useAuth()
  const { state, isMobile } = useSidebar()
  const t = useTranslations("nav")
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false)
  const [quickCreateInitialData, setQuickCreateInitialData] = useState<
    | Partial<{
        material_type: string
        width: string
        length: string
        thickness: string
        notes: string
      }>
    | undefined
  >(undefined)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const { can } = useRole()
  const canManageRolls = can("manageRolls")
  const readOnlyInventory = isRestrictedCutter(user?.roles)

  // Listen for Quick Create open events
  useEffect(() => {
    const handleOpenQuickCreate = (event: Event) => {
      if (readOnlyInventory) {
        return
      }

      const customEvent = event as CustomEvent
      setIsQuickCreateOpen(true)

      setQuickCreateInitialData(customEvent.detail ?? undefined)
    }

    globalEvents.on(EVENTS.OPEN_QUICK_CREATE, handleOpenQuickCreate)

    return () => {
      globalEvents.off(EVENTS.OPEN_QUICK_CREATE, handleOpenQuickCreate)
    }
  }, [readOnlyInventory])

  // Load unread notifications count
  useEffect(() => {
    const loadUnreadNotifications = async () => {
      try {
        const unreadCount = await notificationCrudService.getUnreadCount()
        console.log(`Found ${unreadCount} unread notifications`)
        setUnreadNotifications(unreadCount)
      } catch (_error) {
        console.log("Notifications table error, falling back to low stock count")
        try {
          const count = await rollService.getLowStockCount()
          setUnreadNotifications(count)
        } catch (fallbackError) {
          console.error("Error loading notifications count:", fallbackError)
          setUnreadNotifications(0)
        }
      }
    }

    loadUnreadNotifications()

    const handleNotificationUpdate = (event: Event) => {
      const customEvent = event as CustomEvent
      if (customEvent.detail && typeof customEvent.detail.unreadCount === "number") {
        console.log(`Notification count updated to ${customEvent.detail.unreadCount}`)
        setUnreadNotifications(customEvent.detail.unreadCount)
      } else {
        loadUnreadNotifications()
      }
    }

    globalEvents.on(EVENTS.NOTIFICATIONS_UPDATED, handleNotificationUpdate)

    const interval = setInterval(loadUnreadNotifications, 30000)

    return () => {
      clearInterval(interval)
      globalEvents.off(EVENTS.NOTIFICATIONS_UPDATED, handleNotificationUpdate)
    }
  }, [])

  const handleQuickCreate = () => {
    if (readOnlyInventory) {
      return
    }
    setQuickCreateInitialData(undefined)
    setIsQuickCreateOpen(true)
  }

  const handleEmailClick = () => {
    router.push("/dashboard/notifications")
  }

  const isItemActive = (url: string, subItems?: NavMainItem["subItems"]) => {
    if (subItems?.length) {
      return subItems.some((sub) => path.startsWith(sub.url))
    }
    return path === url
  }

  const isSubmenuOpen = (subItems?: NavMainItem["subItems"]) => {
    return subItems?.some((sub) => path.startsWith(sub.url)) ?? false
  }

  const quickCreateLabel = t("chrome.quickCreate")
  const notificationsSrLabel =
    unreadNotifications > 0
      ? t("chrome.notificationsUnread", { count: unreadNotifications })
      : t("chrome.notifications")

  return (
    <>
      <QuickCreateDialog
        open={isQuickCreateOpen}
        onOpenChange={setIsQuickCreateOpen}
        initialData={quickCreateInitialData}
      />
      <SidebarGroup>
        <SidebarGroupContent className="flex flex-col gap-2">
          <SidebarMenu>
            <SidebarMenuItem className="flex items-center gap-2">
              {canManageRolls && (
                <SidebarMenuButton
                  tooltip={quickCreateLabel}
                  className="min-w-8 bg-primary text-primary-foreground transition-colors hover:bg-accent-fg hover:text-primary-foreground active:scale-[0.98] active:bg-accent-fg active:text-primary-foreground"
                  onClick={handleQuickCreate}
                >
                  <PlusCircleIcon className="size-4" />
                  <span>{quickCreateLabel}</span>
                </SidebarMenuButton>
              )}
              <Button
                size="icon"
                className="relative h-9 w-9 shrink-0 group-data-[collapsible=icon]:opacity-0"
                variant="outline"
                onClick={handleEmailClick}
              >
                <MailIcon className="h-4 w-4" />
                <span className="sr-only">{notificationsSrLabel}</span>
                {unreadNotifications > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary ring-2 ring-background"
                  />
                )}
              </Button>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      {items.map((group) => (
        <SidebarGroup key={group.id}>
          {group.labelKey && <SidebarGroupLabel>{t(group.labelKey)}</SidebarGroupLabel>}
          <SidebarGroupContent className="flex flex-col gap-2">
            <SidebarMenu>
              {group.items.map((item) => {
                if (state === "collapsed" && !isMobile) {
                  if (!item.subItems) {
                    return (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton
                          asChild
                          aria-disabled={item.comingSoon}
                          tooltip={t(item.titleKey)}
                          isActive={isItemActive(item.url)}
                        >
                          <Link href={item.url} target={item.newTab ? "_blank" : undefined}>
                            {item.icon && <item.icon />}
                            <span>{t(item.titleKey)}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  }
                  return <NavItemCollapsed key={item.url} item={item} isActive={isItemActive} />
                }
                return (
                  <NavItemExpanded
                    key={item.url}
                    item={item}
                    isActive={isItemActive}
                    isSubmenuOpen={isSubmenuOpen}
                  />
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  )
}
