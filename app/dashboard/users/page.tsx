"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Plus, Search, Shield } from "lucide-react"
import { toast } from "sonner"

import type { UserProfile } from "@/src/infrastructure/models/supabase"
import { userManagementService } from "@/src/infrastructure/services/userManagementService"
import { useRole } from "@/src/infrastructure/services/useRole"
import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/app/components/ui/tabs"

import { UsersTable } from "./_components/users-table"
import { UserFormModal } from "./_components/user-form-modal"
import { DeactivateUserDialog } from "./_components/deactivate-user-dialog"

type TabValue = "active" | "all"

export default function UsersPage() {
  const { userId: currentUserId, isAdmin, isLoading: isRoleLoading } = useRole()
 
  const [users, setUsers] = useState<UserProfile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [tab, setTab] = useState<TabValue>("active")

  // Modal state
  const [formModalOpen, setFormModalOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null)

  // Deactivate dialog state
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false)
  const [userToDeactivate, setUserToDeactivate] = useState<UserProfile | null>(null)
  const [isDeactivating, setIsDeactivating] = useState(false)

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
    fetchUsers()
  }, [fetchUsers])

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesTab = tab === "all" || !user.is_deleted
      const term = searchTerm.toLowerCase()
      const matchesSearch =
        !term ||
        user.full_name?.toLowerCase().includes(term) ||
        user.email?.toLowerCase().includes(term) ||
        user.roles.some((r) => r.toLowerCase().includes(term))
      return matchesTab && matchesSearch
    })
  }, [users, tab, searchTerm])

  function handleCreateUser() {
    setSelectedUser(null)
    setFormModalOpen(true)
  }

  function handleEditUser(user: UserProfile) {
    setSelectedUser(user)
    setFormModalOpen(true)
  }

  function handleDeactivateClick(user: UserProfile) {
    setUserToDeactivate(user)
    setDeactivateDialogOpen(true)
  }

  async function handleDeactivateConfirm() {
    if (!userToDeactivate) return
    setIsDeactivating(true)
    try {
      await userManagementService.deactivateUser(userToDeactivate.id)
      toast.success(`${userToDeactivate.full_name ?? "User"} has been deactivated`)
      await fetchUsers()
    } catch (_error) {
      toast.error("Failed to deactivate user")
    } finally {
      setIsDeactivating(false)
      setDeactivateDialogOpen(false)
      setUserToDeactivate(null)
    }
  }

  async function handleReactivate(user: UserProfile) {
    try {
      await userManagementService.reactivateUser(user.id)
      toast.success(`${user.full_name ?? "User"} has been reactivated`)
      await fetchUsers()
    } catch (_error) {
      toast.error("Failed to reactivate user")
    }
  }

  if (isRoleLoading) {
    return null
  }

  if (!isAdmin) {
    console.log(isRoleLoading, "isAdmin", isAdmin);
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <Shield className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Access Restricted</h2>
        <p className="text-muted-foreground">Only admins can manage users.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-muted-foreground">
            Manage user accounts, roles, and access control
          </p>
        </div>
        <Button onClick={handleCreateUser} size="lg" className="min-h-[44px]">
          <Plus className="mr-2 h-5 w-5" />
          Create User
        </Button>
      </div>

      {/* Search + Tab filters */}
      <Card>
        <CardHeader>
          <CardTitle>Search & Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or role…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 min-h-[44px]"
              />
            </div>
            <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
              <TabsList>
                <TabsTrigger value="active">Active</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <UsersTable
        users={filteredUsers}
        isLoading={isLoading}
        currentUserId={currentUserId}
        onEdit={handleEditUser}
        onDeactivate={handleDeactivateClick}
        onReactivate={handleReactivate}
      />

      {/* Create / Edit modal */}
      <UserFormModal
        open={formModalOpen}
        onOpenChange={setFormModalOpen}
        user={selectedUser}
        allUsers={users}
        currentUserId={currentUserId}
        onSuccess={fetchUsers}
      />

      {/* Deactivate confirmation */}
      <DeactivateUserDialog
        open={deactivateDialogOpen}
        onOpenChange={setDeactivateDialogOpen}
        user={userToDeactivate}
        onConfirm={handleDeactivateConfirm}
        isSubmitting={isDeactivating}
      />
    </div>
  )
}
