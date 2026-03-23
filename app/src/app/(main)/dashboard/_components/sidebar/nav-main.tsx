"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";

import { ChevronRight, MailIcon, PlusCircleIcon, X } from "lucide-react";

import { rollService } from "@/services/rollService";
import { materialTypeService } from "@/services/materialTypeService";
import { notificationCrudService } from "@/services/notificationCrudService";
import { toast } from "sonner";
import { globalEvents, EVENTS } from "@/lib/events";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
} from "@/components/ui/sidebar";
import type { NavGroup, NavMainItem } from "@/navigation/sidebar/sidebar-items";
import { useRole } from "@/services/useRole";

interface NavMainProps {
  readonly items: readonly NavGroup[];
}

const IsComingSoon = () => (
  <span className="ml-auto rounded-md bg-gray-200 px-2 py-1 text-xs dark:text-gray-800">Soon</span>
);

const NavItemExpanded = ({
  item,
  isActive,
  isSubmenuOpen,
}: {
  item: NavMainItem;
  isActive: (url: string, subItems?: NavMainItem["subItems"]) => boolean;
  isSubmenuOpen: (subItems?: NavMainItem["subItems"]) => boolean;
}) => {
  return (
    <Collapsible key={item.title} asChild defaultOpen={isSubmenuOpen(item.subItems)} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          {item.subItems ? (
            <SidebarMenuButton
              disabled={item.comingSoon}
              isActive={isActive(item.url, item.subItems)}
              tooltip={item.title}
            >
              {item.icon && <item.icon />}
              <span>{item.title}</span>
              {item.comingSoon && <IsComingSoon />}
              <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
            </SidebarMenuButton>
          ) : (
            <SidebarMenuButton
              asChild
              aria-disabled={item.comingSoon}
              isActive={isActive(item.url)}
              tooltip={item.title}
            >
              <Link prefetch={false} href={item.url} target={item.newTab ? "_blank" : undefined}>
                {item.icon && <item.icon />}
                <span>{item.title}</span>
                {item.comingSoon && <IsComingSoon />}
              </Link>
            </SidebarMenuButton>
          )}
        </CollapsibleTrigger>
        {item.subItems && (
          <CollapsibleContent>
            <SidebarMenuSub>
              {item.subItems.map((subItem) => (
                <SidebarMenuSubItem key={subItem.title}>
                  <SidebarMenuSubButton aria-disabled={subItem.comingSoon} isActive={isActive(subItem.url)} asChild>
                    <Link prefetch={false} href={subItem.url} target={subItem.newTab ? "_blank" : undefined}>
                      {subItem.icon && <subItem.icon />}
                      <span>{subItem.title}</span>
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
  );
};

const NavItemCollapsed = ({
  item,
  isActive,
}: {
  item: NavMainItem;
  isActive: (url: string, subItems?: NavMainItem["subItems"]) => boolean;
}) => {
  return (
    <SidebarMenuItem key={item.title}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            disabled={item.comingSoon}
            tooltip={item.title}
            isActive={isActive(item.url, item.subItems)}
          >
            {item.icon && <item.icon />}
            <span>{item.title}</span>
            <ChevronRight />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-50 space-y-1" side="right" align="start">
          {item.subItems?.map((subItem) => (
            <DropdownMenuItem key={subItem.title} asChild>
              <SidebarMenuSubButton
                key={subItem.title}
                asChild
                className="focus-visible:ring-0"
                aria-disabled={subItem.comingSoon}
                isActive={isActive(subItem.url)}
              >
                <Link prefetch={false} href={subItem.url} target={subItem.newTab ? "_blank" : undefined}>
                  {subItem.icon && <subItem.icon className="[&>svg]:text-sidebar-foreground" />}
                  <span>{subItem.title}</span>
                  {subItem.comingSoon && <IsComingSoon />}
                </Link>
              </SidebarMenuSubButton>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
};

export function NavMain({ items }: NavMainProps) {
  const path = usePathname();
  const router = useRouter();
  const { state, isMobile } = useSidebar();
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [materialTypes, setMaterialTypes] = useState<string[]>([]);
  const { can } = useRole();
  const canManageRolls = can("manageRolls");
  const [formData, setFormData] = useState({
    material_type: '',
    width: '',
    length: '',
    thickness: '',
    color: '',
    location: '',
    supplier: '',
    cost_per_sqft: '',
    notes: ''
  });

  // Load material types
  useEffect(() => {
    const loadMaterialTypes = async () => {
      try {
        const data = await materialTypeService.getNames();
        setMaterialTypes(data.map(m => m.name));
      } catch (error) {
        console.error('Error loading material types:', error);
      }
    };

    loadMaterialTypes();

    // Listen for Quick Create open events (e.g., from Order Material button)
    const handleOpenQuickCreate = (event: Event) => {
      const customEvent = event as CustomEvent;
      setIsQuickCreateOpen(true);

      // Pre-fill the form with provided values
      if (customEvent.detail) {
        const details = customEvent.detail;
        setFormData(prev => ({
          ...prev,
          material_type: details.material_type || prev.material_type,
          width: details.width || prev.width,
          length: details.length || prev.length,
          thickness: details.thickness || prev.thickness,
          notes: details.notes || prev.notes,
        }));
      }
    };

    globalEvents.on('OPEN_QUICK_CREATE' as any, handleOpenQuickCreate);

    return () => {
      globalEvents.off('OPEN_QUICK_CREATE' as any, handleOpenQuickCreate);
    };
  }, []);

  // Load unread notifications count
  useEffect(() => {
    const loadUnreadNotifications = async () => {
      try {
        const unreadCount = await notificationCrudService.getUnreadCount();
        console.log(`Found ${unreadCount} unread notifications`);
        setUnreadNotifications(unreadCount);
      } catch (error) {
        // If table doesn't exist, fall back to low stock count
        console.log('Notifications table error, falling back to low stock count');
        try {
          const count = await rollService.getLowStockCount();
          setUnreadNotifications(count);
        } catch (fallbackError) {
          console.error('Error loading notifications count:', fallbackError);
          setUnreadNotifications(0);
        }
      }
    };

    loadUnreadNotifications();

    // Listen for notification updates from other components
    const handleNotificationUpdate = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail && typeof customEvent.detail.unreadCount === 'number') {
        console.log(`Notification count updated to ${customEvent.detail.unreadCount}`);
        setUnreadNotifications(customEvent.detail.unreadCount);
      } else {
        // If no count provided, reload from database
        loadUnreadNotifications();
      }
    };

    globalEvents.on(EVENTS.NOTIFICATIONS_UPDATED, handleNotificationUpdate);

    // Refresh every 30 seconds
    const interval = setInterval(loadUnreadNotifications, 30000);

    return () => {
      clearInterval(interval);
      globalEvents.off(EVENTS.NOTIFICATIONS_UPDATED, handleNotificationUpdate);
    };
  }, []);

  const handleQuickCreate = () => {
    // Open the add roll modal
    setIsQuickCreateOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Validate required fields
      if (!formData.material_type || !formData.width || !formData.length || !formData.thickness) {
        toast.error('Please fill in all required fields');
        return;
      }

      // Create the roll via service
      await rollService.addRoll({
        material_type: formData.material_type,
        width: parseFloat(formData.width),
        length: parseFloat(formData.length),
        thickness: parseFloat(formData.thickness),
        color: formData.color || undefined,
        location: formData.location || undefined,
        supplier: formData.supplier || undefined,
        cost_per_sqft: formData.cost_per_sqft ? parseFloat(formData.cost_per_sqft) : undefined,
        notes: formData.notes || undefined,
        remaining_length: parseFloat(formData.length), // Set remaining_length to initial length
        status: 'active',
        date_received: new Date().toISOString().split('T')[0]
      } as any);

      toast.success('Roll added successfully!');
      setIsQuickCreateOpen(false);

      // Reset form
      setFormData({
        material_type: '',
        width: '',
        length: '',
        thickness: '',
        color: '',
        location: '',
        supplier: '',
        cost_per_sqft: '',
        notes: ''
      });

      // Navigate to inventory to see the new roll
      router.push('/dashboard/inventory');
    } catch (error) {
      console.error('Error adding roll:', error);
      toast.error('Failed to add roll');
    }
  };

  const handleEmailClick = () => {
    // Navigate to notifications page
    router.push('/dashboard/notifications');
    // Note: Don't clear notification count here since it represents actual unread notifications
  };

  const isItemActive = (url: string, subItems?: NavMainItem["subItems"]) => {
    if (subItems?.length) {
      return subItems.some((sub) => path.startsWith(sub.url));
    }
    return path === url;
  };

  const isSubmenuOpen = (subItems?: NavMainItem["subItems"]) => {
    return subItems?.some((sub) => path.startsWith(sub.url)) ?? false;
  };

  return (
    <>
      {/* Add Roll Modal */}
      <Dialog open={isQuickCreateOpen} onOpenChange={setIsQuickCreateOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Add New Roll</DialogTitle>
            <DialogDescription>
              Add a new rubber roll to inventory. Fields marked with * are required.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="material_type">Material Type *</Label>
                <Select
                  value={formData.material_type}
                  onValueChange={(value) => setFormData({ ...formData, material_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select material" />
                  </SelectTrigger>
                  <SelectContent>
                    {materialTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="e.g., Rack A, Bin 3"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="width">Width (inches) *</Label>
                <Input
                  id="width"
                  type="number"
                  step="0.001"
                  value={formData.width}
                  onChange={(e) => setFormData({ ...formData, width: e.target.value })}
                  placeholder="36"
                  required
                />
              </div>

              <div>
                <Label htmlFor="length">Length (inches) *</Label>
                <Input
                  id="length"
                  type="number"
                  step="0.001"
                  value={formData.length}
                  onChange={(e) => setFormData({ ...formData, length: e.target.value })}
                  placeholder="240"
                  required
                />
              </div>

              <div>
                <Label htmlFor="thickness">Thickness (inches) *</Label>
                <Input
                  id="thickness"
                  type="number"
                  step="0.001"
                  value={formData.thickness}
                  onChange={(e) => setFormData({ ...formData, thickness: e.target.value })}
                  placeholder="0.25"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="color">Color</Label>
                <Input
                  id="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  placeholder="e.g., Black"
                />
              </div>

              <div>
                <Label htmlFor="cost_per_sqft">Cost per Sq Ft ($)</Label>
                <Input
                  id="cost_per_sqft"
                  type="number"
                  step="0.0001"
                  value={formData.cost_per_sqft}
                  onChange={(e) => setFormData({ ...formData, cost_per_sqft: e.target.value })}
                  placeholder="2.50"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="supplier">Supplier</Label>
              <Input
                id="supplier"
                value={formData.supplier}
                onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                placeholder="e.g., ABC Rubber Co."
              />
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes about this roll"
                className="h-20"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsQuickCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                Add Roll
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <SidebarGroup>
        <SidebarGroupContent className="flex flex-col gap-2">
          <SidebarMenu>
            <SidebarMenuItem className="flex items-center gap-2">
              {canManageRolls && (
                <SidebarMenuButton
                  tooltip="Quick Create"
                  className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
                  onClick={handleQuickCreate}
                >
                  <PlusCircleIcon />
                  <span>Quick Create</span>
                </SidebarMenuButton>
              )}
              <Button
                size="icon"
                className="h-9 w-9 shrink-0 group-data-[collapsible=icon]:opacity-0 active:bg-primary active:text-primary-foreground relative"
                variant="outline"
                onClick={handleEmailClick}
              >
                <MailIcon className="h-4 w-4" />
                <span className="sr-only">Notifications</span>
                {unreadNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-background" />
                )}
              </Button>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      {items.map((group) => (
        <SidebarGroup key={group.id}>
          {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
          <SidebarGroupContent className="flex flex-col gap-2">
            <SidebarMenu>
              {group.items.map((item) => {
                if (state === "collapsed" && !isMobile) {
                  // If no subItems, just render the button as a link
                  if (!item.subItems) {
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          aria-disabled={item.comingSoon}
                          tooltip={item.title}
                          isActive={isItemActive(item.url)}
                        >
                          <Link prefetch={false} href={item.url} target={item.newTab ? "_blank" : undefined}>
                            {item.icon && <item.icon />}
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  }
                  // Otherwise, render the dropdown as before
                  return <NavItemCollapsed key={item.title} item={item} isActive={isItemActive} />;
                }
                // Expanded view
                return (
                  <NavItemExpanded key={item.title} item={item} isActive={isItemActive} isSubmenuOpen={isSubmenuOpen} />
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}
