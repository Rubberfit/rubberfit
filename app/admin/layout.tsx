import type { ReactNode } from "react"

import { AdminSidebar } from "./_components/admin-sidebar"
import { AdminTopbar } from "./_components/admin-topbar"
import { AdminProtectedRoute } from "./_components/admin-protected-route"

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminProtectedRoute>
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
        <AdminSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <AdminTopbar />
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </AdminProtectedRoute>
  )
}
