"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Plus, Search, Shield } from "lucide-react"
import { toast } from "sonner"

import type { UserProfile } from "@/src/infrastructure/models/supabase"
import { userManagementService } from "@/src/infrastructure/services/userManagementService"
import { deactivateUser, reactivateUser } from "@/app/actions/users"
import { useRole } from "@/src/infrastructure/services/useRole"
import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select"
import { PageHeader, PageShell } from "@/app/components/patterns"

import { DeactivateUserDialog } from "./_components/deactivate-user-dialog"
import { UserFormModal } from "./_components/user-form-modal"
import { UsersTable } from "./_components/users-table"

/**
 * Users administration — Phase 2 PR 4.
 *
 * Restyled chrome on the existing real-wired surface (admin gate
 * via `useRole`, CRUD via `userManagementService`). Replaces the
 * Phase 1 h1 + `<Card>` wrapper with the dashboard `<PageHeader>`
 * + a flat filter row, and swaps the `<Card>`-wrapped `<Table>`
 * for the Phase 1b `<DataTable>` + token-based `<StatusBadge>`
 * role/status pills.
 *
 * Bulk action bar (per the spec §4 Users acceptance criteria) is
 * deliberately deferred — selection state would require schema
 * coordination with the bulk endpoints in `userManagementService`,
 * which is out of scope for the visual pass. Tracked for the S6
 * wiring task.
 *
 * `UserFormModal` and `DeactivateUserDialog` retain their existing
 * shadcn `<Dialog>` chrome — they're complex form bodies that
 * deserve their own restyle PR rather than rolling into this one.
 *
 * See `docs/superpowers/specs/2026-05-06-dashboard-phase2-design.md` §4.
 */

type StatusFilter = "active" | "deactivated" | "all"

export default function UsersPage() {
  const { userId: currentUserId, isAdmin, isLoading: isRoleLoading } = useRole()

  const [users, setUsers] = useState<UserProfile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active")
  const [roleFilter, setRoleFilter] = useState<string>("all")

  const [formModalOpen, setFormModalOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null)

  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false)
  const [userToDeactivate, setUserToDeactivate] = useState<UserProfile | null>(null)
  const [isDeactivating, setIsDeactivating] = useState(false)
  const [reactivatingUserId, setReactivatingUserId] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await userManagementService.getAllUsers()
      setUsers(data)
    } catch (_error) {
      toast.error("Failed to load users")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchUsers()
  }, [fetchUsers])

  const availableRoles = useMemo(() => {
    const set = new Set<string>()
    users.forEach((user) => (user.roles ?? []).forEach((role) => set.add(role)))
    return Array.from(set).sort()
  }, [users])

  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return users.filter((user) => {
      if (statusFilter === "active" && user.is_deleted) return false
      if (statusFilter === "deactivated" && !user.is_deleted) return false

      if (roleFilter !== "all" && !(user.roles ?? []).includes(roleFilter)) return false

      if (!term) return true
      return (
        (user.full_name?.toLowerCase().includes(term) ?? false) ||
        (user.email?.toLowerCase().includes(term) ?? false) ||
        (user.roles ?? []).some((role) => role.toLowerCase().includes(term))
      )
    })
  }, [users, statusFilter, roleFilter, searchTerm])

  const handleInvite = useCallback(() => {
    setSelectedUser(null)
    setFormModalOpen(true)
  }, [])

  const handleEditUser = useCallback((user: UserProfile) => {
    setSelectedUser(user)
    setFormModalOpen(true)
  }, [])

  const handleDeactivateClick = useCallback((user: UserProfile) => {
    setUserToDeactivate(user)
    setDeactivateDialogOpen(true)
  }, [])

  const handleDeactivateConfirm = useCallback(async () => {
    if (!userToDeactivate) return
    setIsDeactivating(true)
    try {
      await deactivateUser({ userId: userToDeactivate.id })
      toast.success(`${userToDeactivate.full_name ?? "User"} has been deactivated`)
      await fetchUsers()
    } catch (error) {
      // Surface the action's own error message — actions throw with
      // human-readable messages for permission failures and the
      // "cannot deactivate your own account" guard.
      toast.error(error instanceof Error ? error.message : "Failed to deactivate user")
    } finally {
      setIsDeactivating(false)
      setDeactivateDialogOpen(false)
      setUserToDeactivate(null)
    }
  }, [userToDeactivate, fetchUsers])

  const handleReactivate = useCallback(
    async (user: UserProfile) => {
      // Per-user pending guard so an in-flight reactivate can't be re-fired
      // (matches the deactivate flow's `isDeactivating` discipline). Keyed
      // by user id so other rows stay interactive.
      setReactivatingUserId((current) => (current === null ? user.id : current))
      try {
        await reactivateUser({ userId: user.id })
        toast.success(`${user.full_name ?? "User"} has been reactivated`)
        await fetchUsers()
      } catch (error) {
        // Surface the action's own error message — actions throw with
        // human-readable messages for permission failures.
        toast.error(error instanceof Error ? error.message : "Failed to reactivate user")
      } finally {
        setReactivatingUserId((current) => (current === user.id ? null : current))
      }
    },
    [fetchUsers]
  )

  if (isRoleLoading) {
    return null
  }

  if (!isAdmin) {
    return (
      <PageShell variant="overview">
        <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-3 py-20 text-center">
          <Shield className="size-10 text-muted-foreground" aria-hidden="true" />
          <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
            Access restricted
          </h2>
          <p className="text-sm text-muted-foreground">Only admins can manage users.</p>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell variant="form">
      <PageHeader
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Users" }]}
        title="Users"
        subtitle={`${users.length} member${users.length === 1 ? "" : "s"} on this workspace.`}
        actions={
          <Button size="sm" onClick={handleInvite}>
            <Plus className="size-3.5" aria-hidden="true" />
            Invite user
          </Button>
        }
      />

      <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            placeholder="Search by name, email, or role…"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="pl-10"
            aria-label="Search users"
          />
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={roleFilter}
            onValueChange={(value) => setRoleFilter(value)}
            aria-label="Role filter"
          >
            <SelectTrigger className="w-[160px]" aria-label="Role filter">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {availableRoles.map((role) => (
                <SelectItem key={role} value={role} className="capitalize">
                  {role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as StatusFilter)}
            aria-label="Status filter"
          >
            <SelectTrigger className="w-[160px]" aria-label="Status filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="deactivated">Deactivated</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-4">
        <UsersTable
          users={filteredUsers}
          isLoading={isLoading}
          currentUserId={currentUserId}
          reactivatingUserId={reactivatingUserId}
          onInvite={handleInvite}
          onEdit={handleEditUser}
          onDeactivate={handleDeactivateClick}
          onReactivate={handleReactivate}
        />
      </div>

      <UserFormModal
        open={formModalOpen}
        onOpenChange={setFormModalOpen}
        user={selectedUser}
        allUsers={users}
        currentUserId={currentUserId}
        onSuccess={fetchUsers}
      />

      <DeactivateUserDialog
        open={deactivateDialogOpen}
        onOpenChange={setDeactivateDialogOpen}
        user={userToDeactivate}
        onConfirm={handleDeactivateConfirm}
        isSubmitting={isDeactivating}
      />
    </PageShell>
  )
}
