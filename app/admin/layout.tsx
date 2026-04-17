import type { ReactNode } from "react"

import { AdminSidebar } from "./_components/admin-sidebar"
import { AdminTopbar } from "./_components/admin-topbar"

// TODO: wrap with admin-only ProtectedRoute when auth guard is implemented

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      <AdminSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <AdminTopbar />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}
