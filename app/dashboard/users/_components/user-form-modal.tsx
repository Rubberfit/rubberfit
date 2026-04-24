"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useForm, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

import type { UserProfile } from "@/src/infrastructure/models/supabase"
import type { AppRole } from "@/src/application/permissions"
import { userManagementService } from "@/src/infrastructure/services/userManagementService"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog"
import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import { Label } from "@/app/components/ui/label"
import { Checkbox } from "@/app/components/ui/checkbox"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog"
import { Switch } from "@/app/components/ui/switch"

// ─── Schemas ────────────────────────────────────────────────────────────────

const ALL_ROLES: AppRole[] = ["admin", "manager", "supervisor", "cutter", "member", "viewer"]

const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  admin: "Full system access",
  manager: "Manage inventory, orders, and materials",
  supervisor: "Approve cuts and view reports",
  cutter: "Access cut planner only",
  member: "View inventory and dashboard",
  viewer: "Read-only access",
}

const editSchema = z.object({
  full_name: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email"),
  roles: z.array(z.string()).min(1, "At least one role is required"),
})

const createSchema = z.object({
  full_name: z.string().min(1, "Name is required"),
  email: z
    .string()
    .email("Enter a valid email")
    .refine((e) => !e.toLowerCase().endsWith("@archandanchor.com"), {
      message: "@archandanchor.com accounts cannot be created here",
    }),
  password: z.string().min(6, "Password must be at least 6 characters"),
  roles: z.array(z.string()).min(1, "At least one role is required"),
})

const createSchemaOpen = z.object({
  full_name: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  roles: z.array(z.string()).min(1, "At least one role is required"),
})

type EditFormData = z.infer<typeof editSchema>
type CreateFormData = z.infer<typeof createSchema>

// ─── Sub-component: role checkboxes ────────────────────────────────────────

interface RoleCheckboxGroupProps {
  value: string[]
  onChange: (roles: string[]) => void
  lockedRoles?: AppRole[]
  onAdminAdd?: () => void
  error?: string
}

function RoleCheckboxGroup({ value, onChange, lockedRoles = [], onAdminAdd, error }: RoleCheckboxGroupProps) {
  function toggle(role: AppRole) {
    if (lockedRoles.includes(role)) return
    if (value.includes(role)) {
      onChange(value.filter((r) => r !== role))
    } else {
      if (role === "admin" && onAdminAdd) {
        onAdminAdd()
        return
      }
      onChange([...value, role])
    }
  }

  return (
    <div className="space-y-1">
      <Label>Roles</Label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 mt-1">
        {ALL_ROLES.map((role) => {
          const isLocked = lockedRoles.includes(role)
          return (
            <label
              key={role}
              className={cn(
                "flex items-start gap-2 rounded-md border p-3 transition-colors",
                isLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted/50",
              )}
            >
              <Checkbox
                checked={value.includes(role)}
                onCheckedChange={() => toggle(role)}
                disabled={isLocked}
                className="mt-0.5"
              />
              <div>
                <div className="text-sm font-medium capitalize">{role}</div>
                <div className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</div>
                {isLocked && (
                  <div className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                    Cannot remove from admin
                  </div>
                )}
              </div>
            </label>
          )
        })}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(" ")
}

// ─── Edit form ──────────────────────────────────────────────────────────────

interface EditUserFormProps {
  user: UserProfile
  allUsers: UserProfile[]
  currentUserId: string | null
  onUserChange: (user: UserProfile) => void
  onSuccess: () => void
  onClose: () => void
}

function EditUserForm({ user, allUsers, currentUserId, onUserChange, onSuccess, onClose }: EditUserFormProps) {
  const isSelf = user.id === currentUserId
  const userRoles = user.roles ?? []
  const isAdmin = userRoles.includes("admin")

  const form = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      full_name: user.full_name ?? "",
      email: user.email ?? "",
      roles: userRoles,
    },
  })

  // Reset form when the selected user changes
  useEffect(() => {
    form.reset({
      full_name: user.full_name ?? "",
      email: user.email ?? "",
      roles: userRoles,
    })
  }, [user.id, form, userRoles])

  const [submitting, setSubmitting] = useState(false)
  const [adminConfirmOpen, setAdminConfirmOpen] = useState(false)

  function handleAdminAdd() {
    setAdminConfirmOpen(true)
  }

  function confirmAdminAdd() {
    form.setValue("roles", [...form.getValues("roles"), "admin"])
    setAdminConfirmOpen(false)
  }

  async function onSubmit(data: EditFormData) {
    setSubmitting(true)
    try {
      await userManagementService.updateUser(user.id, {
        full_name: data.full_name,
        email: data.email,
        roles: data.roles as AppRole[],
      })
      toast.success("User updated successfully")
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update user")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        {/* User email selector */}
        <div className="space-y-1.5">
          <Label>User</Label>
          <Select value={user.id} onValueChange={(id) => {
            const next = allUsers.find((u) => u.id === id)
            if (next) onUserChange(next)
          }}>
            <SelectTrigger className="min-h-[44px]">
              <SelectValue placeholder="Select a user" />
            </SelectTrigger>
            <SelectContent>
              {allUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.email ?? u.full_name ?? u.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <FormField
          control={form.control}
          name="full_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full Name</FormLabel>
              <FormControl>
                <Input placeholder="Jane Smith" {...field} className="min-h-[44px]" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="jane@example.com"
                  {...field}
                  className="min-h-[44px]"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="roles"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <RoleCheckboxGroup
                  value={field.value}
                  onChange={field.onChange}
                  lockedRoles={isAdmin && isSelf ? ["admin"] : []}
                  onAdminAdd={handleAdminAdd}
                  error={form.formState.errors.roles?.message}
                />
              </FormControl>
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
            className="min-h-[44px]"
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting} className="min-h-[44px]">
            {submitting ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </form>

      <AlertDialog open={adminConfirmOpen} onOpenChange={setAdminConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Grant admin access?</AlertDialogTitle>
            <AlertDialogDescription>
              Admins have full system access including user management, pricing, and all settings.
              This cannot be undone without another admin manually removing the role.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAdminAdd}>
              Yes, grant admin
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Form>
  )
}

// ─── Create form ────────────────────────────────────────────────────────────

interface CreateUserFormProps {
  onSuccess: () => void
  onClose: () => void
}

function CreateUserForm({ onSuccess, onClose }: CreateUserFormProps) {
  const [allowInternalDomain, setAllowInternalDomain] = useState(false)
  const allowRef = useRef(allowInternalDomain)

  const dynamicResolver = useCallback<Resolver<CreateFormData>>(
    async (values, context, options) => {
      const schema = allowRef.current ? createSchemaOpen : createSchema
      return zodResolver(schema)(values, context, options)
    },
    [],
  )

  const form = useForm<CreateFormData>({
    resolver: dynamicResolver,
    defaultValues: { full_name: "", email: "", password: "", roles: ["member"] },
  })

  const [submitting, setSubmitting] = useState(false)

  function handleToggle(checked: boolean) {
    allowRef.current = checked
    setAllowInternalDomain(checked)
    void form.trigger("email")
  }

  async function onSubmit(data: CreateFormData) {
    setSubmitting(true)
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          full_name: data.full_name,
          roles: data.roles,
          allowInternalDomain,
        }),
      })

      const json = (await response.json()) as { error?: string }

      if (!response.ok) {
        throw new Error(json.error ?? "Failed to create user")
      }

      toast.success("User created successfully")
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create user")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <FormField
          control={form.control}
          name="full_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full Name</FormLabel>
              <FormControl>
                <Input placeholder="Jane Smith" {...field} className="min-h-[44px]" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="jane@example.com"
                  {...field}
                  className="min-h-[44px]"
                />
              </FormControl>
              <FormMessage />
              <div className="flex items-center gap-2 pt-1">
                <Switch
                  id="allow-internal-domain"
                  checked={allowInternalDomain}
                  onCheckedChange={handleToggle}
                />
                <label
                  htmlFor="allow-internal-domain"
                  className="text-xs text-muted-foreground cursor-pointer select-none"
                >
                  Allow <span className="font-medium text-foreground">@archandanchor.com</span> email
                </label>
              </div>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Temporary Password</FormLabel>
              <FormControl>
                <Input type="password" placeholder="Min. 6 characters" {...field} className="min-h-[44px]" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="roles"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <RoleCheckboxGroup
                  value={field.value}
                  onChange={field.onChange}
                  error={form.formState.errors.roles?.message}
                />
              </FormControl>
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
            className="min-h-[44px]"
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting} className="min-h-[44px]">
            {submitting ? "Creating…" : "Create User"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  )
}

// ─── Public modal wrapper ───────────────────────────────────────────────────

interface UserFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: UserProfile | null
  allUsers: UserProfile[]
  currentUserId: string | null
  onSuccess: () => void
}

export function UserFormModal({ open, onOpenChange, user, allUsers, currentUserId, onSuccess }: UserFormModalProps) {
  const isEdit = user !== null
  const [activeUser, setActiveUser] = useState<UserProfile | null>(user)

  // Sync activeUser when the modal opens with a new user
  useEffect(() => {
    if (open) setActiveUser(user)
  }, [open, user])

  function handleSuccess() {
    onSuccess()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit User" : "Create User"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update user information and role assignments."
              : "Create a new user account with immediate access."}
          </DialogDescription>
        </DialogHeader>

        {isEdit && activeUser ? (
          <EditUserForm
            key={activeUser.id}
            user={activeUser}
            allUsers={allUsers}
            currentUserId={currentUserId}
            onUserChange={setActiveUser}
            onSuccess={handleSuccess}
            onClose={() => onOpenChange(false)}
          />
        ) : (
          <CreateUserForm onSuccess={handleSuccess} onClose={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}
