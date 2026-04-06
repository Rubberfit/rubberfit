# lib/

Shared utilities, configuration, and core library code used across the application.

## Files

- **supabase.ts** -- Supabase browser client initialization and all database type definitions (Roll, Cut, Supplier, PO, etc.)

```typescript
import { createBrowserClient } from "@supabase/ssr"
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)

// Key type definitions exported from this file:
export interface Roll {
  id: string; material_type: string; width: number; length: number;
  thickness: number; remaining_length: number; status: "active" | "depleted" | "reserved"; /* ... */
}
export interface Cut {
  id: string; roll_id?: string; cut_width: number; cut_length: number;
  quantity: number; waste_sqft?: number; waste_percentage?: number; /* ... */
}
export interface Supplier { id: string; name: string; active: boolean; preferred: boolean; rating: number; /* ... */ }
export interface PurchaseOrder { id: string; po_number: string; supplier_id: string; status: "draft" | "pending" | "approved" | "ordered" | "received" | "cancelled"; /* ... */ }
// + MaterialType, MaterialSupplier, ReorderRule, PriceHistory, NotificationPreferences, NotificationQueue, etc.
```
- **utils.ts** -- General utilities: `cn()` for class merging, `getInitials()`, `formatCurrency()`

```typescript
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const getInitials = (str: string): string => {
  return str.trim().split(/\s+/).filter(Boolean).map((word) => word[0]).join("").toUpperCase() || "?"
}

export function formatCurrency(
  amount: number,
  opts?: { currency?: string; locale?: string; noDecimals?: boolean }
) {
  return new Intl.NumberFormat(locale, { style: "currency", currency, /* ... */ }).format(amount)
}
```
- **permissions.ts** -- Role and permission type definitions, role-checking helpers (`hasAnyRole`, `hasPermission`)

```typescript
export type AppRole = "admin" | "cutter" | "manager" | "member" | "supervisor" | "viewer"
export type Permission = keyof typeof PERMISSIONS

export const PERMISSIONS = {
  viewInventory: ["admin", "manager", "supervisor", "cutter", "member", "viewer"],
  manageRolls: ["admin", "manager"],
  accessCutPlanner: ["admin", "cutter"],
  accessManagement: ["admin", "manager"],
  accessAnalytics: ["admin", "manager", "supervisor"],
  // ...
} as const satisfies Record<string, readonly AppRole[]>

export function hasAnyRole(userRoles: readonly AppRole[], requiredRoles: readonly AppRole[]) {
  return requiredRoles.some((role) => userRoles.includes(role))
}

export function hasPermission(userRoles: readonly AppRole[], permission: Permission) {
  return hasAnyRole(userRoles, PERMISSIONS[permission])
}
```
- **rbac.ts** -- Route-level access control: role normalization, path authorization, sidebar nav filtering by role

```typescript
export function normalizeRoles(roles?: string[] | null): AppRole[] {
  if (!Array.isArray(roles) || roles.length === 0) return [...DEFAULT_ROLES]
  return roles.filter(Boolean).map((role) => role.toLowerCase() as AppRole)
}

export function canAccessPath(roles: string[] | null | undefined, pathname: string): boolean {
  // Restricted cutters can only access cut-planner and inventory
  if (isRestrictedCutter(normalizedRoles)) { /* check CUTTER_ALLOWED_EXACT_PATHS */ }
  const permission = getRequiredPermission(pathname)
  return !permission || hasPermission(normalizedRoles, permission)
}

export function filterNavGroupsForRoles(groups: NavGroup[], roles: string[] | null | undefined): NavGroup[] {
  // Filters sidebar nav items based on role permissions
  return groups.map((group) => ({ ...group, items: group.items.map(item => filterMainItem(item, roles)).filter(Boolean) })).filter(g => g.items.length > 0)
}
```
- **events.ts** -- Simple EventEmitter for cross-component communication (emit/on/off)

```typescript
class EventEmitter extends EventTarget {
  emit(eventName: string, detail?: unknown) { this.dispatchEvent(new CustomEvent(eventName, { detail })) }
  on(eventName: string, callback: EventListener) { this.addEventListener(eventName, callback) }
  off(eventName: string, callback: EventListener) { this.removeEventListener(eventName, callback) }
}

export const globalEvents = new EventEmitter()

export const EVENTS = {
  NOTIFICATIONS_UPDATED: "notifications-updated",
  ROLL_ADDED: "roll-added",
  ROLL_UPDATED: "roll-updated",
  OPEN_QUICK_CREATE: "open-quick-create",
} as const
```
- **getCurrentUserId.ts** -- Async helper to get the current Supabase auth user ID

```typescript
export async function getCurrentUserId(): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error("Not authenticated")
  return user.id
}
```
- **app-url.ts** -- Constructs browser-accessible app URLs (handles different environments)

```typescript
export function getBrowserAppUrl(pathname = "/"): string {
  // Priority: window.location.origin > NEXT_PUBLIC_SITE_URL > NEXT_PUBLIC_VERCEL_URL > localhost:3000
  let baseUrl = browserOrigin ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  return `${baseUrl}${normalizedPath}`
}
```
- **auth-redirect.ts** -- Post-authentication redirect logic with path sanitization and role-based defaults

```typescript
export function sanitizeRedirectPath(pathname?: string | null): string | null {
  // Rejects non-dashboard paths, auth paths, protocol-relative paths
  if (!pathname?.startsWith("/") || pathname.startsWith("/auth")) return null
  if (pathname !== "/dashboard" && !pathname.startsWith("/dashboard/")) return null
  return pathname
}

export function resolvePostAuthRedirect(roles?: string[] | null, requestedPath?: string | null): string {
  const safePath = sanitizeRedirectPath(requestedPath)
  if (safePath && canAccessPath(roles, safePath)) return safePath
  return getDefaultAuthorizedPath(roles)
}
```
- **auth-email-logo.ts** -- Returns the RubberFit logo URL for transactional emails

```typescript
export const RUBBER_FIT_EMAIL_LOGO_BASE64 = "iVBORw0KGgo..." // base64-encoded PNG

export function getRubberFitEmailLogoPng() {
  return Buffer.from(RUBBER_FIT_EMAIL_LOGO_BASE64, "base64")
}
```
- **cookie.client.ts** -- Client-side cookie get/set/delete helpers

```typescript
export function setClientCookie(key: string, value: string, days = 7) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString()
  document.cookie = `${key}=${value}; expires=${expires}; path=/`
}

export function getClientCookie(key: string) {
  return document.cookie.split("; ").find((row) => row.startsWith(`${key}=`))?.split("=")[1]
}

export function deleteClientCookie(key: string) {
  document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`
}
```
- **local-storage.client.ts** -- Safe localStorage get/set/remove wrappers with error handling

```typescript
export function setLocalStorageValue(key: string, value: string) {
  try { window.localStorage.setItem(key, value) }
  catch (error) { /* logs in dev */ }
}

export function getLocalStorageValue(key: string): string | null {
  try { return window.localStorage.getItem(key) }
  catch (_error) { return null }
}

export function removeLocalStorageValue(key: string) {
  try { window.localStorage.removeItem(key) }
  catch (error) { /* logs in dev */ }
}
```

## Subdirectories

- **fonts/** -- Font registry mapping font keys to Next.js font instances
- **preferences/** -- User preference system: config definitions, persistence layer (cookie/localStorage), theme types and DOM application, layout utilities
- **nesting/** -- NFP nesting engine for the cut planner (see `nesting/README.md`)
