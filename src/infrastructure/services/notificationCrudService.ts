import { supabase } from "@/src/infrastructure/models/supabase"

interface Notification {
  id: string
  type: string
  title: string
  description: string
  material_type?: string
  current_value?: number
  threshold_value?: number
  is_read: boolean
  created_at: string
  updated_at?: string
}

export const notificationCrudService = {
  async getAll() {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) throw error
    return data as Notification[]
  },

  async getByType(type: string) {
    const { data, error } = await supabase
      .from("notifications")
      .select("id, material_type")
      .eq("type", type)

    if (error) throw error
    return data
  },

  async getUnreadCount() {
    const { data, error } = await supabase.from("notifications").select("id").eq("is_read", false)

    if (error) throw error
    return data?.length ?? 0
  },

  async exists() {
    const { data: _data, error } = await supabase.from("notifications").select("id").limit(1)

    return !error
  },

  async create(notification: Omit<Notification, "id" | "created_at" | "updated_at">) {
    const { data, error } = await supabase
      .from("notifications")
      .insert([notification])
      .select()
      .single()

    if (error) throw error
    return data as Notification
  },

  async bulkCreate(notifications: Omit<Notification, "id" | "created_at" | "updated_at">[]) {
    if (notifications.length === 0) return []
    const { data, error } = await supabase.from("notifications").insert(notifications).select()

    if (error) throw error
    return data as Notification[]
  },

  async update(id: string, updates: Partial<Notification>) {
    const { data, error } = await supabase
      .from("notifications")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error
    return data as Notification
  },

  async markAsRead(id: string) {
    return this.update(id, { is_read: true })
  },

  async markAllAsRead() {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("is_read", false)

    if (error) throw error
  },

  async deleteByIds(ids: string[]) {
    if (ids.length === 0) return
    const { error } = await supabase.from("notifications").delete().in("id", ids)

    if (error) throw error
  },

  async deleteAll() {
    const { error } = await supabase
      .from("notifications")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000")

    if (error) throw error
  },
}
